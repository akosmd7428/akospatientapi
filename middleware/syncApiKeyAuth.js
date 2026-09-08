const crypto = require('crypto');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');

const HEADER_NAME = 'x-sync-api-key';

const safeEqual = (a, b) => {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
};

const syncApiKeyAuth = (req, res, next) => {
    const expected = process.env.SYNC_API_KEY;

    if (!expected) {
        return CommonHelper.sendErrorUnencrypt(
            res,
            STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR,
            'SYNC_API_KEY is not configured on the server'
        );
    }

    const provided = req.header(HEADER_NAME);
    if (!provided || !safeEqual(provided, expected)) {
        return CommonHelper.sendErrorUnencrypt(
            res,
            STATUS_CODE.HTTP_401_UNAUTHORIZED,
            'Invalid or missing sync API key'
        );
    }

    next();
};

module.exports = syncApiKeyAuth;
