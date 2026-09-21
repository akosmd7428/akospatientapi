const { encryptData,decryptData } = require('../config/encryption');
class CommonHelper {
    static sendErrorUnencrypt(res, statusCode, message, errors = []) {
        res.status(statusCode).json({
            success: false,
            message,
            errors
        });
    }

    static sendSuccessUnencrypt(res, data, statusCode, message, additionalData = {}) {   
       res.status(statusCode).json({
            success: true,
            message,
            data,
            ...additionalData
        });  
    }

    // SEC-004: encryptData now returns a per-message IV and a GCM auth tag.
    // All three fields must reach the client or it cannot decrypt.
    static sendSuccess(res, data, statusCode, message, additionalData = {}) {
        const payload = JSON.stringify({ success: true, message, data, ...additionalData });
        const { encryptedData, IV, tag } = encryptData(payload);
        res.status(statusCode).json({ encryptedData, IV, tag });
    }

    static sendError(res, statusCode, message, errors = []) {
        const payload = JSON.stringify({ success: false, message, errors });
        const { encryptedData, IV, tag } = encryptData(payload);
        res.status(statusCode).json({ encryptedData, IV, tag });
    }

     static generateUuidV4() {
            const crypto = require('crypto');

            const bytes = crypto.randomBytes(16);

            // Set version (UUIDv4): xxxx-xx4x-xxxx
            bytes[6] = (bytes[6] & 0x0f) | 0x40;

            // Set variant (RFC 4122): xxxxxxxx-xxxx-xxxx-8xxx-xxxxxxxxxxxx
            bytes[8] = (bytes[8] & 0x3f) | 0x80;

            const hex = bytes.toString('hex');

            return (
                hex.slice(0, 8) + '-' +
                hex.slice(8, 12) + '-' +
                hex.slice(12, 16) + '-' +
                hex.slice(16, 20) + '-' +
                hex.slice(20)
            );
    }

    // SEC-017: previously referenced an undefined `jwt` and signed with the API's
    // own JWT_SECRET, so an email link was accepted as an API session. It now uses
    // the dedicated email-token issuer with its own secret and a `typ` claim.
    static generateVerificationLink(userId, baseUrl) {
        const { issueEmailToken } = require('./tokenHelper');
        const token = issueEmailToken({ userId });
        return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    }

    /**
     * SEC-020: the previous implementation read x-forwarded-for directly and took
     * the LEFTMOST entry, which is the attacker-controlled position. That made the
     * SSO IP allow-list bypassable with one header.
     *
     * req.ip applies the app's `trust proxy` setting, which is configured in
     * index.js to the exact number of proxies in front of us.
     */
    static getClientIp(req) {
        const ip = String(req.ip || '').replace(/^::ffff:/i, '');
        return ip === '::1' ? '127.0.0.1' : ip;
    }

    // match an ip against a stored whitelist, entries can be separated by comma, semicolon, space or new line
    static isIpWhitelisted(ip, whitelist) {
        if (!whitelist) {
            return false;
        }
        const allowedIps = String(whitelist)
            .split(/[\s,;]+/)
            .map(entry => entry.replace(/^::ffff:/i, '').trim())
            .filter(entry => entry.length > 0);

        if (allowedIps.length === 0) {
            return false;
        }
        // SEC-020: a '*' entry previously disabled the control silently. An
        // allow-list that allows everything is a misconfiguration, not a policy.
        if (allowedIps.includes('*')) {
            console.error('[security] ip allow-list contains a wildcard entry; refusing to honour it');
            return false;
        }
        return allowedIps.includes(ip);
    }

    // constant time comparison for secrets so the response time does not leak the value
    static secureCompare(value, expected) {
        const crypto = require('crypto');

        if (typeof value !== 'string' || typeof expected !== 'string') {
            return false;
        }
        const valueBuffer = Buffer.from(value);
        const expectedBuffer = Buffer.from(expected);
        // SEC-016: this previously logged the secret it was given, on every call.
        if (valueBuffer.length !== expectedBuffer.length) {
            return false;
        }
        return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
    }


//     const valid = crypto.timingSafeEqual(
//     Buffer.from(company.client_secret),
//     Buffer.from(clientSecret)
// );

}

module.exports = CommonHelper;
