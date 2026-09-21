'use strict';

/**
 * Payload encryption for request and response bodies.
 *
 * SEC-004: the previous implementation used a hardcoded aes-256-cbc key and a
 * single fixed IV, both committed to git. Replaced with AES-256-GCM, a key from
 * the environment only, and a fresh random IV per message.
 *
 * SEC-029: authenticated encryption means tampered ciphertext is rejected by tag
 * verification before any padding is examined, so the padding-oracle behaviour of
 * the old implementation cannot exist. Failures throw; nothing fails open.
 *
 * NOTE: this changes the wire format. Clients must now send and expect a `tag`
 * field alongside `encryptedData` and a per-message `IV`.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const TAG_BYTES = 16;

let cachedKey = null;

function getKey() {
    if (cachedKey) return cachedKey;

    const raw = process.env.PAYLOAD_ENC_KEY;
    if (!raw) {
        throw new Error('PAYLOAD_ENC_KEY is not set');
    }
    const key = Buffer.from(raw, 'hex');
    if (key.length !== 32) {
        throw new Error('PAYLOAD_ENC_KEY must be 32 bytes (64 hex chars)');
    }
    cachedKey = key;
    return cachedKey;
}

/**
 * @param {string} plaintext
 * @returns {{ IV: string, tag: string, encryptedData: string }}
 */
function encryptData(plaintext) {
    // No try/catch: a crypto failure must propagate, never return undefined.
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const ciphertext = Buffer.concat([
        cipher.update(String(plaintext), 'utf8'),
        cipher.final(),
    ]);

    return {
        IV: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
        encryptedData: ciphertext.toString('hex'),
    };
}

/**
 * @param {string} encryptedData hex
 * @param {string} ivHex hex
 * @param {string} tagHex hex
 * @returns {string} plaintext
 * @throws if the ciphertext is malformed or has been tampered with
 */
function decryptData(encryptedData, ivHex, tagHex) {
    if (typeof encryptedData !== 'string' || typeof ivHex !== 'string' || typeof tagHex !== 'string') {
        throw new Error('Malformed ciphertext');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new Error('Malformed ciphertext');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
        decipher.update(Buffer.from(encryptedData, 'hex')),
        decipher.final(), // throws on tampering
    ]).toString('utf8');
}

module.exports = { encryptData, decryptData };
