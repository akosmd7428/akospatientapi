'use strict';

/**
 * Password recovery.
 *
 * SEC-002: /change-password required neither authentication nor proof that the
 * OTP flow had been completed. verifyOtp was stateless - it returned a boolean
 * and recorded nothing - and changePassword never consulted it, so
 * {email, newPassword} alone rewrote any account's credential.
 *
 * The fix is a single-use, time-limited reset token, created only on successful
 * OTP verification and consumed atomically by the change step.
 *
 * SEC-003: bcrypt replaces unsalted MD5.
 * SEC-018: identifiers come from crypto, not Math.random().
 * SEC-028: every path returns the same generic message, so the response cannot
 *          be used to tell whether an address is registered or what role it holds.
 */

const { Op } = require('sequelize');
const Patient = require('../models/patientModel');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');
const CareNavigator = require('../models/careNavigatorModel');
const Hr = require('../models/hrModel');
const PasswordReset = require('../models/passwordReset');
const { generateOtp, validateOtp } = require('../helpers/otpHelper');
const { messages } = require('../config/language');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const { hashPassword, validatePasswordStrength } = require('../helpers/passwordHelper');
const { randomDigits, randomToken } = require('../helpers/secureRandom');
const { escapeHtml } = require('../helpers/escapeHtml');
const { revokeAllSessions } = require('./tokenRevocationService');
const { AppError, BadRequestError } = require('../helpers/errors');
const crypto = require('crypto');

const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const normalise = (email) => String(email || '').trim().toLowerCase();

/** Resolve which kind of account an address belongs to, without disclosing it. */
async function findAccount(email) {
    const where = { email };

    const patient = await Patient.findOne({ where });
    if (patient) return { kind: 'patient', record: patient };

    const navigator = await CareNavigator.findOne({ where });
    if (navigator) return { kind: 'careNavigator', record: navigator };

    const hr = await Hr.findOne({ where });
    if (hr) return { kind: 'hr', record: hr };

    const dependent = await ConnectedCompaniesPatient.findOne({ where: { patientEmail: email } });
    if (dependent) return { kind: 'dependent', record: dependent };

    return null;
}

class ForgotPasswordService {
    /**
     * SEC-021: the OTP is issued only after the account is confirmed to exist, so
     * a flood of requests for unknown addresses costs nothing and stores nothing.
     * The response is identical either way.
     */
    static async sendOtp(email) {
        const key = normalise(email);
        const account = await findAccount(key);

        if (account) {
            const otp = await generateOtp(key);
            const html = `
    <html>
    <body>
        <h2>Your OTP Code</h2>
        <p>Hello,</p>
        <p>Here is your One-Time Password (OTP) code:</p>
        <h1 style="font-size: 24px; color: #007BFF;">${escapeHtml(otp)}</h1>
        <p>This OTP is valid for 5 minutes. Please use it within this time frame.</p>
        <p>If you did not request this OTP, please ignore this email.</p>
        <p>Thank you!</p>
    </body>
    </html>`;
            await emailHelperSMTP(key, key, 'OTP Code', html);
        } else {
            // Out-of-band signal: the email tells the user they have no account.
            // The HTTP response does not.
            try {
                await emailHelperSMTP(
                    key,
                    key,
                    'Password reset requested',
                    `<html><body><p>A password reset was requested for this address, but it is not registered with us. No action is needed.</p></body></html>`
                );
            } catch (err) {
                // Delivery failure must not change the response shape.
            }
        }

        return messages.otpSentIfRegistered;
    }

    /**
     * On success this issues the capability that /change-password requires.
     * @returns {Promise<{resetToken:string}>}
     */
    static async verifyOtp(email, otp, requestedByIp) {
        const key = normalise(email);

        const ok = await validateOtp(key, otp);
        if (!ok) {
            throw new AppError(messages.invalidOtp, 400, 'INVALID_OTP');
        }

        const account = await findAccount(key);
        if (!account) {
            throw new AppError(messages.invalidOtp, 400, 'INVALID_OTP');
        }

        const { raw, hash } = randomToken(32);

        // One live reset token per address.
        await PasswordReset.destroy({ where: { email: key } });
        await PasswordReset.create({
            email: key,
            role: account.kind,
            tokenHash: hash,
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
            usedAt: null,
            requestedByIp: requestedByIp || null,
        });

        return { resetToken: raw };
    }

    /**
     * @param {string} email
     * @param {string} newPassword
     * @param {string} resetToken issued by verifyOtp
     */
    static async changePassword(email, newPassword, resetToken) {
        const key = normalise(email);

        if (!resetToken || typeof resetToken !== 'string') {
            throw new AppError(messages.invalidResetToken, 400, 'INVALID_RESET_TOKEN');
        }

        const problems = validatePasswordStrength(newPassword);
        if (problems.length > 0) {
            throw new BadRequestError(problems.join('. '));
        }

        // Atomic consume: the UPDATE only matches an unused, unexpired row, so a
        // concurrent replay of the same token cannot also succeed.
        const [affected] = await PasswordReset.update(
            { usedAt: new Date() },
            {
                where: {
                    email: key,
                    tokenHash: sha256(resetToken),
                    usedAt: null,
                    expiresAt: { [Op.gt]: new Date() },
                },
            }
        );
        if (affected !== 1) {
            throw new AppError(messages.invalidResetToken, 400, 'INVALID_RESET_TOKEN');
        }

        const hashedPassword = await hashPassword(newPassword);
        const account = await findAccount(key);
        if (!account) {
            throw new AppError(messages.invalidResetToken, 400, 'INVALID_RESET_TOKEN');
        }

        switch (account.kind) {
            case 'hr':
                await Hr.update({ password: hashedPassword }, { where: { email: key } });
                await revokeAllSessions(account.record.id, 'hr');
                break;

            case 'careNavigator':
                await CareNavigator.update({ password: hashedPassword }, { where: { email: key } });
                await revokeAllSessions(account.record.id, 'careNavigator');
                break;

            case 'patient': {
                const patient = account.record;
                const update = { password: hashedPassword };
                if (!(patient.isFirstLogin == 1 && patient.isProfileCompleted == 1)) {
                    update.uniquePatientId = randomDigits(5);
                }
                await Patient.update(update, { where: { email: key } });
                await revokeAllSessions(patient.id, 'patient');
                break;
            }

            case 'dependent': {
                // A dependent activating for the first time has no Patient row yet.
                // This branch used to be reachable by anyone; it now requires a
                // consumed reset token, so the caller has proven control of the
                // mailbox before an account is created.
                const uniquePatientId = randomDigits(5);
                const created = await Patient.create({
                    email: key,
                    password: hashedPassword,
                    uniquePatientId,
                });
                await ConnectedCompaniesPatient.update(
                    {
                        password: hashedPassword,
                        patientId: created.id,
                        uniquePatientId,
                        status: true,
                        isActive: true,
                    },
                    { where: { patientEmail: key } }
                );
                break;
            }

            default:
                throw new AppError(messages.invalidResetToken, 400, 'INVALID_RESET_TOKEN');
        }

        // Housekeeping: no other live reset token for this address survives.
        await PasswordReset.destroy({ where: { email: key } });

        return messages.passwordChanged;
    }
}

module.exports = ForgotPasswordService;
