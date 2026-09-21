'use strict';

/**
 * Startup configuration validation.
 *
 * SEC-010 / SEC-032: secrets must come from the environment only. No module may
 * fall back to a hardcoded literal, so a misconfigured deployment has to fail
 * loudly here rather than run quietly on a published key.
 *
 * SEC-030: an empty database password is rejected.
 *
 * Call this first in index.js, before anything listens.
 */

const crypto = require('crypto');

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/**
 * SHA-256 of credentials that were published in git history and are therefore
 * permanently compromised. If one of these is still configured, the rotation
 * required by SEC-010 has not happened and the process must not start.
 *
 * Add the hash of every credential as it is retired.
 */
const REVOKED_SECRET_HASHES = new Set([
    // AES_SECRET_KEY — was a fallback literal in helpers/aesCryptoHelper.js
    'c640dfa5f37a814ce83f2a8f6eaee7166a7ec2296f2b3b6d691a47da7f9de085',
    // Bitly access token — was a literal in services/bitlyService.js
    '08ea676f809b9a84f005fea9552cc2866e4708dde79ff88b9098b38e45ed9b95',
    // aes-256-cbc payload key — was a literal in config/encryption.js
    '2f3441060d07651a99033749e723cd6a304ffd6e3117c87fefac231e3065f2e5',
]);

const REQUIRED = [
    { name: 'JWT_SECRET', minLength: 32 },
    { name: 'PAYLOAD_ENC_KEY', minLength: 64, hex: true },
    { name: 'AES_SECRET_KEY', minLength: 64, hex: true },
    { name: 'DB_HOST1', minLength: 1 },
    { name: 'DB_USER1', minLength: 1 },
    { name: 'DB_PASSWORD1', minLength: 8 },
    { name: 'DB_NAME1', minLength: 1 },
];

const OPTIONAL_SECRETS = [
    'SYNC_API_KEY',
    'DEV_SENDGRID_API_KEY',
    'SMTP_PASSWORD',
    'SMS_API_KEY',
    'REDCLIFF_KEY',
    'API_SECRET',
];

function validateEnv({ strict = process.env.NODE_ENV === 'production' } = {}) {
    const errors = [];
    const warnings = [];

    for (const { name, minLength, hex } of REQUIRED) {
        const value = process.env[name];

        if (!value) {
            errors.push(`${name} is not set`);
            continue;
        }
        if (value.length < minLength) {
            errors.push(`${name} is too short (${value.length} chars, minimum ${minLength})`);
        }
        if (hex && !/^[0-9a-f]+$/i.test(value)) {
            errors.push(`${name} must be hex-encoded`);
        }
        if (REVOKED_SECRET_HASHES.has(sha256(value))) {
            errors.push(`${name} is a known-compromised credential and must be rotated (SEC-010)`);
        }
    }

    for (const name of OPTIONAL_SECRETS) {
        const value = process.env[name];
        if (value && REVOKED_SECRET_HASHES.has(sha256(value))) {
            errors.push(`${name} is a known-compromised credential and must be rotated (SEC-010)`);
        }
    }

    // SEC-030: root is not an appropriate account for the application to use.
    if (String(process.env.DB_USER1).toLowerCase() === 'root') {
        const message = 'DB_USER1 is "root" — use a least-privilege database account (SEC-030)';
        if (strict) errors.push(message);
        else warnings.push(message);
    }

    if (errors.length > 0) {
        const detail = errors.map((e) => `  - ${e}`).join('\n');
        throw new Error(`Refusing to start, configuration is invalid:\n${detail}`);
    }

    return { warnings };
}

module.exports = { validateEnv, REVOKED_SECRET_HASHES, sha256 };
