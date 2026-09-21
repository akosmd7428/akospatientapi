'use strict';

/**
 * Session revocation.
 *
 * SEC-017: there was no logout, no revocation list and no refresh mechanism.
 * A stolen token stayed valid for 24 hours and survived a password change, so
 * the only way to terminate a known-compromised session was to rotate
 * JWT_SECRET, which logs out every user on the platform.
 *
 * Two revocation levels:
 *   - per session, by jti (logout on one device)
 *   - per user, by cutoff timestamp (logout everywhere; used on password change)
 *
 * Backed by the database so it holds across instances. Entries are pruned once
 * they pass the maximum access-token lifetime, so the tables stay small.
 */

const { Op } = require('sequelize');
const RefreshToken = require('../models/refreshToken');

// Access tokens live 15 minutes; a revocation only needs to outlive that.
const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

// jti -> expiry timestamp. Process-local fast path.
const revokedJtis = new Map();
// `${role}:${userId}` -> cutoff timestamp (tokens issued before this are dead).
const userCutoffs = new Map();

function prune(now = Date.now()) {
    for (const [jti, expiresAt] of revokedJtis) {
        if (expiresAt <= now) revokedJtis.delete(jti);
    }
    for (const [key, cutoff] of userCutoffs) {
        if (cutoff + ACCESS_TOKEN_MAX_AGE_MS <= now) userCutoffs.delete(key);
    }
}

function revokeJti(jti) {
    if (!jti) return;
    revokedJtis.set(jti, Date.now() + ACCESS_TOKEN_MAX_AGE_MS);
    prune();
}

function revokeAllForUser(userId, role) {
    userCutoffs.set(`${role}:${userId}`, Date.now());
    prune();
}

/**
 * @param {{jti?:string, id?:number, role?:string, iat?:number}} claims
 */
async function isJtiRevoked(claims) {
    const now = Date.now();
    prune(now);

    if (claims.jti && revokedJtis.has(claims.jti)) {
        return true;
    }

    const cutoff = userCutoffs.get(`${claims.role}:${claims.id}`);
    if (cutoff && typeof claims.iat === 'number' && claims.iat * 1000 < cutoff) {
        return true;
    }

    // Durable check: the refresh token issued alongside this access token is the
    // session record. If it has been revoked, so has the access token.
    if (claims.jti) {
        const row = await RefreshToken.findOne({
            where: { jti: claims.jti, revokedAt: { [Op.ne]: null } },
            attributes: ['id'],
        });
        if (row) {
            revokedJtis.set(claims.jti, now + ACCESS_TOKEN_MAX_AGE_MS);
            return true;
        }
    }

    return false;
}

/** Revoke every live session for a user. Used on logout-all, password change and reset. */
async function revokeAllSessions(userId, role) {
    revokeAllForUser(userId, role);
    await RefreshToken.update(
        { revokedAt: new Date() },
        { where: { userId, role, revokedAt: null } }
    );
}

module.exports = {
    isJtiRevoked,
    revokeJti,
    revokeAllForUser,
    revokeAllSessions,
    ACCESS_TOKEN_MAX_AGE_MS,
};
