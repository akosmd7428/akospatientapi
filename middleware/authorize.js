const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secret');
const messages = require('../config/language').messages;
const { STATUS_CODE } = require('../config/constant');

// roles carried in the login token, the doctor token is issued by doctorportalapi with the same secret
const ROLES = {
    PATIENT: 'patient',
    CARE_NAVIGATOR: 'careNavigator',
    HR: 'hr',
    DOCTOR: 'doctor',
};

const getBearerToken = (req) => {
    const header = req.header('Authorization') || '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token || null;
};

// verify a login token and return its payload, or null when it is not a valid login token for one of the roles
const verifyLoginToken = (token, allowedRoles) => {
    if (!token) return null;
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (error) {
        return null;
    }
    // email verification links and other signed tokens share the secret but carry no id/role, never accept them as a login
    if (!decoded || !decoded.id || !decoded.role) return null;
    if (allowedRoles && !allowedRoles.includes(decoded.role)) return null;
    return decoded;
};

// only lets the request through when the token belongs to one of the allowed roles
const authorize = (...allowedRoles) => (req, res, next) => {
    const token = getBearerToken(req);
    if (!token) {
        return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenNotFound });
    }

    const decoded = verifyLoginToken(token, allowedRoles);
    if (!decoded) {
        return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenInvalid });
    }

    // the frontends send the role header, it has to agree with the token when present
    const roleHeader = req.header('role');
    if (roleHeader && roleHeader !== decoded.role) {
        return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenInvalid });
    }

    req.user = decoded;
    next();
};

module.exports = { authorize, verifyLoginToken, getBearerToken, ROLES };
