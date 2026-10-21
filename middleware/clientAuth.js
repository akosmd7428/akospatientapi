const crypto = require('crypto');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');

const CLIENT_ID_HEADER = 'x-client-id';
const CLIENT_SECRET_HEADER = 'x-client-secret';

// API_CLIENTS is a comma separated list of clientId:secret pairs, e.g. "patient-portal:xxxx,care-navigator:yyyy"
const loadClients = () => {
    const clients = new Map();
    (process.env.API_CLIENTS || '').split(',').forEach((entry) => {
        const index = entry.indexOf(':');
        if (index <= 0) return;
        const clientId = entry.slice(0, index).trim();
        const secret = entry.slice(index + 1).trim();
        if (clientId && secret) clients.set(clientId, secret);
    });
    return clients;
};

const clients = loadClients();

// hash both sides so timingSafeEqual always compares equal lengths and the secret length is not leaked
const safeEqual = (a, b) => {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
};

const clientAuth = (req, res, next) => {
    if (clients.size === 0) {
        return CommonHelper.sendErrorUnencrypt(
            res,
            STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR,
            'API_CLIENTS is not configured on the server'
        );
    }

    const clientId = req.header(CLIENT_ID_HEADER);
    const clientSecret = req.header(CLIENT_SECRET_HEADER);
    const expected = clientId ? clients.get(clientId) : undefined;

    // still run the comparison for an unknown client id so the response time does not reveal valid ids
    const valid = safeEqual(clientSecret || '', expected || crypto.randomBytes(32).toString('hex'));
    if (!clientId || !clientSecret || !expected || !valid) {
        return CommonHelper.sendErrorUnencrypt(
            res,
            STATUS_CODE.HTTP_401_UNAUTHORIZED,
            'Invalid or missing client credentials'
        );
    }

    req.apiClientId = clientId;
    next();
};

module.exports = clientAuth;
