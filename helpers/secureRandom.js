'use strict';

/**
 * SEC-018: Math.random() was used in 16 places to generate security-relevant
 * values - the password-reset OTP, unique patient ids, prescription ids and lab
 * booking ids. V8's PRNG state is recoverable from a handful of observed
 * outputs, and several of those values are returned to callers in normal API
 * responses, so observing a few leaks the rest.
 *
 * These are the replacements. All draw from crypto.
 */

const crypto = require('crypto');

/** Unbiased integer in [min, max). */
const randomInt = (min, max) => crypto.randomInt(min, max);

/** A numeric id of n digits, zero-padded. Replaces Math.floor(10000 + Math.random() * 90000). */
function randomDigits(digits) {
    const max = 10 ** digits;
    return String(crypto.randomInt(0, max)).padStart(digits, '0');
}

/** 128-bit unguessable identifier, URL-safe. For anything that appears in a URL. */
const randomId = () => crypto.randomBytes(16).toString('hex');

/** A human-readable reference that is still unguessable. */
function randomReference(prefix, sequence) {
    const seq = String(sequence == null ? crypto.randomInt(0, 1_000_000) : sequence).padStart(6, '0');
    return `${prefix}${seq}-${crypto.randomBytes(4).toString('hex')}`;
}

/** An opaque token plus its storage hash. The raw value is returned once. */
function randomToken(bytes = 32) {
    const raw = crypto.randomBytes(bytes).toString('hex');
    return { raw, hash: crypto.createHash('sha256').update(raw).digest('hex') };
}

module.exports = { randomInt, randomDigits, randomId, randomReference, randomToken };
