'use strict';

/**
 * The single authentication and authorization middleware.
 *
 * SEC-001: jwtAuth, jwtAuthHr and jwtAuthCareNavigator were byte-identical and
 * enforced nothing. Their only check was that a client-supplied `role` HEADER
 * matched the `role` claim in the client's own token - a comparison the client
 * controlled on both sides. No middleware ever asserted the caller actually held
 * the required role, so any patient reached every HR and care-navigator route.
 *
 * The loose `!=` also meant a token with no role claim passed when the header was
 * omitted, because `null != undefined` is false.
 *
 * Here the role is read from the verified token and checked against a
 * server-side allow-list. The header is not read at all.
 *
 * SEC-009: companyIds come from the token too, never from a header.
 * SEC-017: verification pins the algorithm and checks issuer, audience and type.
 */

const { verifyAccessToken } = require('../helpers/tokenHelper');
const { isJtiRevoked } = require('../services/tokenRevocationService');
const { STATUS_CODE } = require('../config/constant');
const messages = require('../config/language').messages;

const ROLES = Object.freeze({
    PATIENT: 'patient',
    HR: 'hr',
    CARE_NAVIGATOR: 'careNavigator',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

function extractBearer(req) {
    const header = req.header('Authorization') || '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
}

/**
 * @param {...string} allowedRoles roles permitted on this route
 */
function requireAuth(...allowedRoles) {
    // Fail closed at boot rather than at request time: a route that forgets to
    // name a role is a bug, not an open door.
    if (allowedRoles.length === 0) {
        throw new Error('requireAuth() must be given at least one role');
    }
    for (const role of allowedRoles) {
        if (!ALL_ROLES.includes(role)) {
            throw new Error(`requireAuth() given an unknown role: ${role}`);
        }
    }

    return async (req, res, next) => {
        const token = extractBearer(req);
        if (!token) {
            return res
                .status(STATUS_CODE.HTTP_401_UNAUTHORIZED)
                .json({ success: false, message: messages.tokenNotFound });
        }

        let claims;
        try {
            claims = verifyAccessToken(token);
        } catch (err) {
            return res
                .status(STATUS_CODE.HTTP_401_UNAUTHORIZED)
                .json({ success: false, message: messages.tokenInvalid });
        }

        // SEC-017: a revoked session must stop working immediately, not in 24h.
        try {
            if (await isJtiRevoked(claims)) {
                return res
                    .status(STATUS_CODE.HTTP_401_UNAUTHORIZED)
                    .json({ success: false, message: messages.tokenInvalid });
            }
        } catch (err) {
            // Revocation store unavailable: fail closed on a security check.
            return res
                .status(STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR)
                .json({ success: false, message: messages.serverError });
        }

        // Authorization: strict comparison against the server-side allow-list.
        if (!allowedRoles.includes(claims.role)) {
            return res
                .status(STATUS_CODE.HTTP_403_FORBIDDEN)
                .json({ success: false, message: messages.forbidden });
        }

        req.user = {
            id: claims.id,
            email: claims.email,
            role: claims.role,
            companyIds: Array.isArray(claims.companyIds) ? claims.companyIds : [],
            jti: claims.jti,
            act: claims.act || null, // impersonation actor, see SEC-012
            scope: claims.scope || null,
            issuedAt: claims.iat,
        };

        return next();
    };
}

/**
 * SEC-012: an impersonated session must not perform sensitive writes
 * (password change, payment, consent). Mount after requireAuth.
 */
function denyImpersonated(req, res, next) {
    if (req.user && req.user.act) {
        return res
            .status(STATUS_CODE.HTTP_403_FORBIDDEN)
            .json({ success: false, message: messages.forbidden });
    }
    return next();
}

module.exports = { requireAuth, denyImpersonated, ROLES, ALL_ROLES };
