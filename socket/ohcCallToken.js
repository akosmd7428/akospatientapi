const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secret');

/*
 * Socket token for a talk to doctor call made from the OHC portal for a company patient.
 * - signed with a key derived from JWT_SECRET (not JWT_SECRET itself), so it is never accepted
 *   by the REST apis (jwtAuth / authorize verify with JWT_SECRET) and a login token is never accepted as one
 * - only valid for the socket (audience), only for the call events (enforced in socket/index.js)
 * - short lived
 */
const OHC_CALL_SCOPE = 'ohc-call';
const OHC_CALL_AUDIENCE = 'patientportal-socket';
const OHC_CALL_ISSUER = 'patientportalapi';
const OHC_CALL_TOKEN_TTL_SECONDS = 2 * 60 * 60;

const signingKey = () => crypto.createHmac('sha256', JWT_SECRET).update('ohc-call-socket-token').digest();

const signOhcCallToken = (patientId) => jwt.sign(
    { id: patientId, role: 'patient', scope: OHC_CALL_SCOPE },
    signingKey(),
    {
        algorithm: 'HS256',
        expiresIn: OHC_CALL_TOKEN_TTL_SECONDS,
        audience: OHC_CALL_AUDIENCE,
        issuer: OHC_CALL_ISSUER,
        subject: String(patientId),
    }
);

// payload of a valid ohc call token, null for anything else (login tokens included)
const verifyOhcCallToken = (token) => {
    if (!token || typeof token !== 'string') return null;
    try {
        const decoded = jwt.verify(token, signingKey(), {
            algorithms: ['HS256'],
            audience: OHC_CALL_AUDIENCE,
            issuer: OHC_CALL_ISSUER,
        });
        const id = Number(decoded.id);
        if (decoded.scope !== OHC_CALL_SCOPE || !Number.isInteger(id) || id <= 0 || decoded.sub !== String(id) || typeof decoded.exp !== 'number') {
            return null;
        }
        return decoded;
    } catch (error) {
        return null;
    }
};

module.exports = { signOhcCallToken, verifyOhcCallToken, OHC_CALL_TOKEN_TTL_SECONDS };
