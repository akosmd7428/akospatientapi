'use strict';

/**
 * Token issuance and verification.
 *
 * SEC-017: every jwt.verify call in the codebase passed only the token and the
 * secret - no algorithm pinning, no issuer, no audience, no token type. Tokens
 * lasted 24 hours with no logout, no revocation and no refresh, so a stolen
 * token survived a password change.
 *
 * This module is the single place tokens are signed and verified.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secret');

const ISSUER = 'patientportalapi';
const AUDIENCE = 'patientportal';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_TOKEN_TTL = '1h';

// A separate secret for email links so a verification token can never be
// presented as an API session. Derived from JWT_SECRET when not configured so
// existing deployments keep working, but with a distinct domain separator.
const EMAIL_TOKEN_SECRET = process.env.EMAIL_TOKEN_SECRET
    || crypto.createHmac('sha256', String(JWT_SECRET)).update('email-verification').digest('hex');

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/**
 * @param {{id:number, email:string, role:string, companyIds?:number[]}} user
 * @param {{act?:object, scope?:string[]}} [options] impersonation actor / narrowed scope
 */
function issueAccessToken(user, options = {}) {
    const jti = crypto.randomUUID();

    const claims = {
        sub: String(user.id),
        id: user.id,
        email: user.email,
        role: user.role,
        // SEC-009: tenant scope travels inside the signed token, never in a header.
        companyIds: Array.isArray(user.companyIds) ? user.companyIds : [],
        typ: 'access',
        jti,
    };

    if (options.act) claims.act = options.act;
    if (options.scope) claims.scope = options.scope;

    const token = jwt.sign(claims, JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: options.expiresIn || ACCESS_TOKEN_TTL,
        issuer: ISSUER,
        audience: AUDIENCE,
    });

    return { token, jti };
}

function verifyAccessToken(token) {
    const claims = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'], // pinned, not left to a library default
        issuer: ISSUER,
        audience: AUDIENCE,
        clockTolerance: 5,
    });

    // Blocks token confusion: an email-verification or refresh token presented
    // to the API is rejected even though it verifies.
    if (claims.typ !== 'access') {
        throw new jwt.JsonWebTokenError('Wrong token type');
    }
    if (typeof claims.role !== 'string' || !claims.role) {
        throw new jwt.JsonWebTokenError('Token carries no role');
    }
    return claims;
}

function issueEmailToken(payload, ttl = EMAIL_TOKEN_TTL) {
    return jwt.sign({ ...payload, typ: 'email_verify' }, EMAIL_TOKEN_SECRET, {
        algorithm: 'HS256',
        expiresIn: ttl,
        issuer: ISSUER,
        audience: 'email-verification',
    });
}

function verifyEmailToken(token) {
    const claims = jwt.verify(token, EMAIL_TOKEN_SECRET, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: 'email-verification',
        clockTolerance: 5,
    });
    if (claims.typ !== 'email_verify') {
        throw new jwt.JsonWebTokenError('Wrong token type');
    }
    return claims;
}

/** Opaque refresh token. Only its hash is stored. */
function generateRefreshToken() {
    const raw = crypto.randomBytes(32).toString('hex');
    return { raw, hash: sha256(raw), expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) };
}

module.exports = {
    issueAccessToken,
    verifyAccessToken,
    issueEmailToken,
    verifyEmailToken,
    generateRefreshToken,
    sha256,
    ISSUER,
    AUDIENCE,
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL_MS,
};
