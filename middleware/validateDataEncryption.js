'use strict';

/**
 * Decrypts request payloads.
 *
 * SEC-029: the previous implementation assigned to an undeclared `data`
 * (an implicit global shared across concurrent requests), dereferenced
 * `encryptedData` with no guard, and let crypto errors propagate to a handler
 * that returned the raw message. All three are fixed here.
 *
 * Every failure mode - malformed input, failed tag verification, invalid JSON -
 * returns one identical response, so the differing error paths can no longer be
 * used as an oracle.
 *
 * SEC-008: this middleware is NOT an access control. It says nothing about who
 * the caller is. Authentication is applied separately, and runs first.
 */

const { decryptData } = require('../config/encryption');
const { STATUS_CODE } = require('../config/constant');

const GENERIC_FAILURE = { success: false, message: 'Invalid request payload' };

function decryptSection(section) {
    if (!section || typeof section !== 'object' || Object.keys(section).length === 0) {
        return { skip: true };
    }

    const { encryptedData, IV, tag } = section;

    // Nothing to decrypt - leave the section as it is.
    if (encryptedData === undefined && IV === undefined && tag === undefined) {
        return { skip: true };
    }

    if (typeof encryptedData !== 'string' || typeof IV !== 'string' || typeof tag !== 'string') {
        return { error: true };
    }

    try {
        return { value: JSON.parse(decryptData(encryptedData, IV, tag)) };
    } catch (err) {
        // One error class for BOTH decryption and parse failure: an attacker
        // must not be able to tell them apart.
        return { error: true };
    }
}

const validateDataEncryption = () => (req, res, next) => {
    for (const key of ['params', 'body', 'query']) {
        const result = decryptSection(req[key]);

        if (result.skip) continue;
        if (result.error) {
            return res.status(STATUS_CODE.HTTP_400_BAD_REQUEST).json(GENERIC_FAILURE);
        }

        if (key === 'query') {
            // Express 4 defines req.query as a getter on some versions; assigning
            // through defineProperty keeps this working either way.
            Object.defineProperty(req, 'query', {
                value: result.value,
                writable: true,
                configurable: true,
                enumerable: true,
            });
        } else {
            req[key] = result.value;
        }
    }

    return next();
};

module.exports = validateDataEncryption;
