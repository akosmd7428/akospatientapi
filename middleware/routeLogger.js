'use strict';

/**
 * Access logging.
 *
 * SEC-016: this ran globally and wrote `JSON.stringify(req.body)` verbatim into
 * the `logs` table on EVERY request. For routes that skip the payload-encryption
 * middleware that meant plaintext credentials - including SSO client_secret -
 * and PHI, stored unencrypted, with no retention policy, in the same database as
 * the data they protect.
 *
 * It now records only route metadata and an allow-list of non-sensitive fields.
 *
 * SEC-017: it also verified the JWT and set req.user with no role check, so
 * identity could be established on routes that never passed an auth middleware.
 * That is removed - only requireAuth may set req.user. The user id for the log
 * line is read from req.user if a later middleware has already set it.
 *
 * SEC-031: the synchronous full-body stringify on every request is gone, so a
 * large payload no longer blocks the event loop.
 */

const LogService = require('../helpers/logErrorHelper');

// Query and body fields that are safe to record. Anything else is reduced to its
// type. An allow-list is used deliberately: a denylist would miss the next
// sensitive field someone adds.
const SAFE_FIELDS = new Set([
    'page', 'limit', 'offset', 'sortBy', 'order',
    'status', 'type', 'filter', 'timeFilter', 'year', 'from_date', 'to_date',
]);

function safeSummary(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        out[key] = SAFE_FIELDS.has(key) ? value : `[redacted:${typeof value}]`;
    }
    return out;
}

const routeLogger = (req, res, next) => {
    // req.user is set by requireAuth when the route is authenticated. This
    // middleware no longer verifies tokens itself.
    const userId = req.user ? req.user.id : null;
    const role = req.user ? req.user.role : null;

    Promise.resolve(
        LogService.logError(
            userId,
            null,
            req.originalUrl,
            req.method,
            'API HIT',
            JSON.stringify(safeSummary(req.body)),
            role
        )
    ).catch(() => { /* logging must never break a request */ });

    next();
};

module.exports = routeLogger;
