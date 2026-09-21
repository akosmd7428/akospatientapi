'use strict';

/**
 * Password hashing and verification.
 *
 * SEC-003: passwords were stored and compared as unsalted MD5, with a
 * non-constant-time `===`. bcryptjs was installed but the login path never
 * called it, so the bcrypt registration path could not authenticate at all.
 *
 * Migration is transparent: a correct legacy MD5 password is accepted once and
 * immediately rehashed with bcrypt, so no user is locked out and no reset
 * campaign is needed. Once the legacy count reaches zero, delete the MD5 branch.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;

/**
 * A fixed bcrypt hash used to equalise work when an account does not exist.
 * SEC-028: without this, a missing account returns measurably faster than an
 * existing one, which is an enumeration oracle.
 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_COST);

const isLegacyMd5 = (stored) => typeof stored === 'string' && /^[a-f0-9]{32}$/i.test(stored);

async function hashPassword(plaintext) {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new Error('Password must be a non-empty string');
    }
    return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * @returns {Promise<{ok: boolean, needsRehash: boolean}>}
 */
async function verifyPassword(plaintext, stored) {
    const supplied = typeof plaintext === 'string' ? plaintext : '';

    // No account, or an account with no usable password (an invited user who has
    // not activated yet - see SEC-035). Still do the work.
    if (!stored) {
        await bcrypt.compare(supplied, DUMMY_HASH);
        return { ok: false, needsRehash: false };
    }

    if (isLegacyMd5(stored)) {
        const legacy = crypto.createHash('md5').update(supplied).digest('hex');
        const a = Buffer.from(legacy);
        const b = Buffer.from(String(stored).toLowerCase());
        const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
        return { ok, needsRehash: ok };
    }

    const ok = await bcrypt.compare(supplied, stored);
    return { ok, needsRehash: false };
}

/**
 * Minimum policy per NIST SP 800-63B: length over composition rules.
 * @returns {string[]} list of problems, empty when acceptable
 */
function validatePasswordStrength(password) {
    const problems = [];
    if (typeof password !== 'string' || password.length < 12) {
        problems.push('Password must be at least 12 characters');
    }
    if (typeof password === 'string' && password.length > 128) {
        problems.push('Password must be at most 128 characters');
    }
    const COMMON = ['password', '12345678', 'qwerty', 'letmein', 'admin', 'welcome'];
    if (typeof password === 'string' && COMMON.some((c) => password.toLowerCase().includes(c))) {
        problems.push('Password is too common');
    }
    return problems;
}

module.exports = {
    hashPassword,
    verifyPassword,
    validatePasswordStrength,
    isLegacyMd5,
    BCRYPT_COST,
};
