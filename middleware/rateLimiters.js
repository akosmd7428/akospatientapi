'use strict';

/**
 * Anti-automation.
 *
 * SEC-021: the only limiter was a single global bucket of 1000 requests per
 * 15 minutes on /api, with no stricter limit on login, OTP or SSO, no
 * failed-attempt counter and no lockout anywhere.
 *
 * SEC-020: it was also ineffective, because `trust proxy` was unset and every
 * request was attributed to the proxy's address. index.js now sets that, so
 * req.ip is the real client and these limiters key on something meaningful.
 *
 * NOTE: the default store is per-process. Behind more than one instance each
 * limit is multiplied by the instance count. Set REDIS_URL and install
 * rate-limit-redis to share state - see docs/security/findings/SEC-021.
 */

const rateLimit = require('express-rate-limit');
const { messages } = require('../config/language');

const MINUTE = 60 * 1000;

const jsonMessage = { success: false, message: messages.tooManyRequests };

/** Broad safety net for the whole API. */
const apiLimiter = rateLimit({
    windowMs: 15 * MINUTE,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage,
});

/**
 * Authentication attempts: keyed on IP *and* account, so a distributed attacker
 * spreading attempts across addresses still trips the per-account budget.
 * Successful requests are not counted.
 */
const authLimiter = rateLimit({
    windowMs: 15 * MINUTE,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const account = String((req.body && req.body.email) || '').trim().toLowerCase();
        return `${req.ip}:${account}`;
    },
    message: jsonMessage,
});

/**
 * OTP issuance is expensive to the business (email and SMS spend) and is a
 * harassment vector, so it is limited per address rather than per IP.
 */
const otpIssueLimiter = rateLimit({
    windowMs: 60 * MINUTE,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String((req.body && req.body.email) || req.ip).trim().toLowerCase(),
    message: jsonMessage,
});

/** Uploads: bounded separately because each one costs disk. */
const uploadLimiter = rateLimit({
    windowMs: 15 * MINUTE,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage,
});

module.exports = { apiLimiter, authLimiter, otpIssueLimiter, uploadLimiter };
