'use strict';

/**
 * OTP issuance and verification.
 *
 * SEC-018: the OTP came from Math.random(), a non-cryptographic PRNG whose
 * internal state is recoverable from observed outputs. It now uses
 * crypto.randomInt over the full 000000-999999 space.
 *
 * SEC-021: the previous store was a module-level Map, so it broke across
 * instances, was lost on restart, grew without bound, and - most importantly -
 * validateOtp never deleted the entry on success, leaving the code replayable
 * for its full five-minute window. There was also no attempt counter.
 *
 * Only the hash of the OTP is stored.
 */

const crypto = require('crypto');
const { Op } = require('sequelize');
const OtpRequest = require('../models/otpRequest');

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const generateOtpValue = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * @param {string} email
 * @returns {Promise<string>} the plaintext OTP, to be delivered out of band
 */
async function generateOtp(email) {
    const key = String(email).trim().toLowerCase();
    const otp = generateOtpValue();

    await OtpRequest.destroy({ where: { email: key } });
    await OtpRequest.create({
        email: key,
        otpHash: sha256(otp),
        attempts: 0,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    return otp;
}

/**
 * @returns {Promise<boolean>} true only on a correct, unexpired, unexhausted OTP
 */
async function validateOtp(email, supplied) {
    const key = String(email).trim().toLowerCase();

    const record = await OtpRequest.findOne({ where: { email: key } });
    if (!record) return false;

    if (record.expiresAt.getTime() < Date.now()) {
        await record.destroy();
        return false;
    }

    if (record.attempts >= MAX_ATTEMPTS) {
        await record.destroy();
        return false;
    }

    await record.increment('attempts');

    const a = Buffer.from(sha256(supplied));
    const b = Buffer.from(record.otpHash);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

    // Single use: consume on success so it cannot be replayed.
    if (ok) await record.destroy();

    return ok;
}

/** Housekeeping so expired rows do not accumulate. */
async function purgeExpiredOtps() {
    return OtpRequest.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
}

module.exports = { generateOtp, validateOtp, purgeExpiredOtps, OTP_TTL_MS, MAX_ATTEMPTS };
