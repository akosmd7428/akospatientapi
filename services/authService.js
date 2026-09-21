'use strict';

/**
 * Authentication.
 *
 * SEC-003: login compared unsalted MD5 with `===`. bcryptjs was imported and used
 * in register(), but login never called bcrypt.compare, so a bcrypt-registered
 * account could never authenticate. Verification now goes through
 * passwordHelper, which accepts a correct legacy MD5 once and immediately
 * rehashes it with bcrypt.
 *
 * SEC-009: the token now carries companyIds, resolved server-side at login, so
 * tenant scope never travels in a client-supplied header.
 *
 * SEC-017: tokens are short-lived, carry iss/aud/jti/typ, and are paired with a
 * revocable refresh token.
 *
 * SEC-028: every failure returns the same generic message, and the non-existent
 * account path does the same bcrypt work as the existing one so timing does not
 * discriminate.
 */

const Patient = require('../models/patientModel');
const CareNavigator = require('../models/careNavigatorModel');
const Hr = require('../models/hrModel');
const RefreshToken = require('../models/refreshToken');
const { hashPassword, verifyPassword } = require('../helpers/passwordHelper');
const { issueAccessToken, generateRefreshToken, sha256 } = require('../helpers/tokenHelper');
const { ROLES } = require('../middleware/requireAuth');
const { AppError, UnauthorizedError } = require('../helpers/errors');
const { messages } = require('../config/language');

const ROLE_NUMBER = { [ROLES.PATIENT]: 1, [ROLES.CARE_NAVIGATOR]: 2, [ROLES.HR]: 3 };

/**
 * SEC-009: resolve the companies a user may see from authoritative data, at
 * login. careNavigator.companyId is a comma-separated list; hr.companyId is a
 * single integer; a patient is scoped to themselves and needs none.
 */
function resolveCompanyIds(user, role) {
    if (role === ROLES.PATIENT) return [];

    const raw = user.companyId;
    if (raw === null || raw === undefined || raw === '') return [];

    return String(raw)
        .split(/[\s,;]+/)
        .map((part) => Number(part))
        .filter((n) => Number.isInteger(n) && n > 0);
}

function modelForRole(role) {
    if (role === ROLES.PATIENT) return Patient;
    if (role === ROLES.CARE_NAVIGATOR) return CareNavigator;
    if (role === ROLES.HR) return Hr;
    return null;
}

class AuthService {
    static async register(data) {
        const { email, password, first_name, last_name } = data;
        return Patient.create({
            email,
            password: await hashPassword(password),
            first_name,
            last_name,
        });
    }

    /**
     * @param {{email:string, password:string, getRole:string}} data
     * @param {string} [ip]
     */
    static async login(data, ip) {
        const { email, password, getRole } = data;

        const Model = modelForRole(getRole);
        if (!Model) {
            throw new UnauthorizedError(messages.invalidCredentials);
        }

        const user = await Model.findOne({ where: { email } });

        // Runs even when the account does not exist, so the two paths cost the same.
        const { ok, needsRehash } = await verifyPassword(password, user && user.password);

        if (!user || !ok) {
            throw new UnauthorizedError(messages.invalidCredentials);
        }

        // A deactivated navigator gets the same message as a wrong password.
        if (getRole === ROLES.CARE_NAVIGATOR && user.isActive == 0) {
            throw new UnauthorizedError(messages.invalidCredentials);
        }

        // SEC-003: silent one-time upgrade from MD5 to bcrypt.
        if (needsRehash) {
            try {
                await user.update({ password: await hashPassword(password) });
            } catch (err) {
                // An upgrade failure must not block a valid login.
            }
        }

        const companyIds = resolveCompanyIds(user, getRole);
        const { token, jti } = issueAccessToken({
            id: user.id,
            email: user.email,
            role: getRole,
            companyIds,
        });

        const refresh = generateRefreshToken();
        await RefreshToken.create({
            userId: user.id,
            role: getRole,
            tokenHash: refresh.hash,
            jti,
            expiresAt: refresh.expiresAt,
            createdByIp: ip || null,
        });

        return { token, refreshToken: refresh.raw, user, role: ROLE_NUMBER[getRole] };
    }

    /**
     * Issue a patient session. Used by the impersonation path, which applies its
     * own authorisation and audit before calling this - see SEC-012.
     *
     * @param {object} patient
     * @param {{act?:object, scope?:string[], expiresIn?:string}} [options]
     */
    static async patientLogin(patient, options = {}) {
        const { token } = issueAccessToken(
            {
                id: patient.id,
                email: patient.email,
                role: ROLES.PATIENT,
                companyIds: [],
            },
            options
        );
        return { token };
    }

    /**
     * SEC-017: rotate a refresh token. Reuse of an already-revoked token means the
     * family is compromised, so every live session for that user is terminated.
     */
    static async refresh(rawToken, ip) {
        if (typeof rawToken !== 'string' || rawToken.length === 0) {
            throw new UnauthorizedError(messages.tokenInvalid);
        }

        const row = await RefreshToken.findOne({ where: { tokenHash: sha256(rawToken) } });
        if (!row || row.expiresAt.getTime() < Date.now()) {
            throw new UnauthorizedError(messages.tokenInvalid);
        }

        if (row.revokedAt) {
            const { revokeAllSessions } = require('./tokenRevocationService');
            await revokeAllSessions(row.userId, row.role);
            console.error('[security] refresh token reuse detected', {
                userId: row.userId,
                role: row.role,
            });
            throw new UnauthorizedError(messages.tokenInvalid);
        }

        await row.update({ revokedAt: new Date() }); // single use

        const Model = modelForRole(row.role);
        const user = Model ? await Model.findByPk(row.userId) : null;
        if (!user) {
            throw new UnauthorizedError(messages.tokenInvalid);
        }

        const companyIds = resolveCompanyIds(user, row.role);
        const { token, jti } = issueAccessToken({
            id: user.id,
            email: user.email,
            role: row.role,
            companyIds,
        });

        const next = generateRefreshToken();
        await RefreshToken.create({
            userId: user.id,
            role: row.role,
            tokenHash: next.hash,
            jti,
            expiresAt: next.expiresAt,
            createdByIp: ip || null,
        });

        return { token, refreshToken: next.raw };
    }

    static async logout(user) {
        const { revokeJti } = require('./tokenRevocationService');
        revokeJti(user.jti);
        await RefreshToken.update(
            { revokedAt: new Date() },
            { where: { jti: user.jti, revokedAt: null } }
        );
    }

    static async logoutAll(user) {
        const { revokeAllSessions } = require('./tokenRevocationService');
        await revokeAllSessions(user.id, user.role);
    }
}

module.exports = AuthService;
module.exports.resolveCompanyIds = resolveCompanyIds;
