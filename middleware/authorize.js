const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_ALGORITHM, JWT_ISSUER, DOCTOR_JWT_ISSUER } = require('../config/secret');
const messages = require('../config/language').messages;
const { STATUS_CODE } = require('../config/constant');

// roles carried in the login token, the doctor token is issued by doctorportalapi with the same secret
const ROLES = {
    PATIENT: 'patient',
    CARE_NAVIGATOR: 'careNavigator',
    HR: 'hr',
    DOCTOR: 'doctor',
};

// the only api allowed to issue a token for each role, a doctorportalapi token claiming role 'patient' is rejected
const ROLE_ISSUER = {
    [ROLES.PATIENT]: JWT_ISSUER,
    [ROLES.CARE_NAVIGATOR]: JWT_ISSUER,
    [ROLES.HR]: JWT_ISSUER,
    [ROLES.DOCTOR]: DOCTOR_JWT_ISSUER,
};

const getBearerToken = (req) => {
    const header = req.header('Authorization') || '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token || null;
};

// verify signature (HS256 only, blocks alg=none / algorithm confusion), expiry and issuer
// returns the payload of a valid login token for any role, or null for a missing, malformed, expired or forged token
const verifyAnyLoginToken = (token) => {
    if (!token || typeof token !== 'string') return null;
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET, {
            algorithms: [JWT_ALGORITHM],
            issuer: [JWT_ISSUER, DOCTOR_JWT_ISSUER],
        });
    } catch (error) {
        return null;
    }
    // email verification links and other signed tokens share the secret but carry no id/role, never accept them as a login
    if (!decoded || typeof decoded !== 'object' || !decoded.id || !decoded.role) return null;
    // jwt.verify only checks exp when it is present, a login token without an expiry is never accepted
    if (typeof decoded.exp !== 'number') return null;
    // the issuer has to be the one that issues this role
    if (!ROLE_ISSUER[decoded.role] || decoded.iss !== ROLE_ISSUER[decoded.role]) return null;
    return decoded;
};

// payload of a valid login token for one of the roles, or null
const verifyLoginToken = (token, allowedRoles) => {
    const decoded = verifyAnyLoginToken(token);
    if (!decoded) return null;
    if (allowedRoles && !allowedRoles.includes(decoded.role)) return null;
    return decoded;
};

const unauthorized = (res, message) => {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message });
};

const forbidden = (res) => res.status(STATUS_CODE.HTTP_403_FORBIDDEN).send({ message: messages.accessForbidden });

// only lets the request through when the token belongs to one of the allowed roles
// 401: no token, or the token is malformed / expired / forged / from the wrong issuer
// 403: a valid token, but for a role this route does not allow
const authorize = (...allowedRoles) => (req, res, next) => {
    const token = getBearerToken(req);
    if (!token) {
        return unauthorized(res, messages.tokenNotFound);
    }

    const decoded = verifyAnyLoginToken(token);
    if (!decoded) {
        return unauthorized(res, messages.tokenInvalid);
    }

    if (allowedRoles.length && !allowedRoles.includes(decoded.role)) {
        return forbidden(res);
    }

    // the frontends send the role header, it has to agree with the token when present
    const roleHeader = req.header('role');
    if (roleHeader && roleHeader !== decoded.role) {
        return forbidden(res);
    }

    req.user = decoded;
    next();
};

// sign options for every login token this api issues
const loginTokenOptions = (expiresIn) => ({ expiresIn, algorithm: JWT_ALGORITHM, issuer: JWT_ISSUER });

module.exports = { authorize, verifyLoginToken, getBearerToken, loginTokenOptions, ROLES };
