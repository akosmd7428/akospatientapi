const crypto = require('crypto');

// Laravel APP_KEY, set as APP_KEY_LARAVEL ("base64:..." or raw) -> key buffer, read when needed so a missing key fails the request and not the app start
const getAppKey = () => {
    const appKey = process.env.APP_KEY_LARAVEL;
    if (!appKey) {
        throw new Error('APP_KEY_LARAVEL is not configured, it is needed to decrypt Laravel encrypted values');
    }
    return appKey.startsWith('base64:')
        ? Buffer.from(appKey.slice(7), 'base64')
        : Buffer.from(appKey, 'utf8');
};

// same as Laravel Crypt::decryptString() with the AES-256-CBC cipher, returns null when the payload is invalid or tampered
// values stored with Crypt::encrypt() are php serialized strings (s:6:"secret";), those are unwrapped too
const laravelDecrypt = (payload) => {
    const key = getAppKey();
    try {
        const json = JSON.parse(Buffer.from(String(payload), 'base64').toString('utf8'));

        // check the MAC first: hmac_sha256(iv . value, APP_KEY)
        const mac = crypto.createHmac('sha256', key).update(json.iv + json.value).digest();
        const given = Buffer.from(json.mac || '', 'hex');
        if (given.length !== mac.length || !crypto.timingSafeEqual(given, mac)) {
            return null;
        }

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(json.iv, 'base64'));
        const value = Buffer.concat([
            decipher.update(Buffer.from(json.value, 'base64')),
            decipher.final(),
        ]).toString('utf8');

        const serialized = value.match(/^s:\d+:"([\s\S]*)";$/);
        return serialized ? serialized[1] : value;
    } catch (error) {
        return null;
    }
};

module.exports = { laravelDecrypt };
