'use strict';

/**
 * SEC-010: the key was published as a `process.env.X || '<literal>'` fallback,
 * byte-identical to the production value in .env, in a git-tracked file. The
 * fallback pattern looks like resilience but publishes the secret it falls back
 * from, and defeats fail-closed behaviour: a misconfigured deployment ran on the
 * hardcoded key instead of refusing to start.
 */
function loadKey() {
    const raw = process.env.AES_SECRET_KEY;
    if (!raw) throw new Error('AES_SECRET_KEY is not set');
    if (!/^[0-9a-f]{64}$/i.test(raw)) throw new Error('AES_SECRET_KEY must be 32 bytes (64 hex chars)');
    return raw;
}

const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const ivLength = 16; // Initialization vector length in bytes

// Function to encrypt data
const aesEncrypt = (data, fields) => {
    const key = loadKey();
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return { iv: iv.toString('hex'), encryptedData: encrypted };
};

// Function to decrypt data
const aesDecrypt = (encryptedData, iv) => {
    const key = loadKey();
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
};

module.exports = { aesEncrypt, aesDecrypt };
