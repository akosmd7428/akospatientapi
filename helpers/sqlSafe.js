'use strict';

/**
 * SEC-006: helpers for the places where a value must be built into SQL text.
 *
 * Bind parameters are the right answer and are used wherever the surrounding
 * query already has a `replacements` object. These helpers cover the remaining
 * cases - `IN (...)` lists and Sequelize.literal() - where binding is either
 * unavailable or would require restructuring the query.
 *
 * The security property is that the output of every function here can only ever
 * contain digits and commas. An integer cannot carry SQL, so interpolating the
 * result is safe. Each function throws rather than returning something unsafe.
 */

const { ForbiddenError } = require('./errors');

/**
 * Normalise anything - an array, a comma-separated string, a single value -
 * into a list of positive integers.
 * @returns {number[]}
 */
function toIdArray(value) {
    if (value === null || value === undefined || value === '') return [];

    const parts = Array.isArray(value) ? value : String(value).split(/[\s,;]+/);

    return parts
        .map((part) => Number(part))
        .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * A comma-separated integer list safe to interpolate into `IN (...)`.
 * Throws when the list is empty, so a query is never silently widened to
 * everything by an absent or malformed scope.
 *
 * @param {*} value
 * @param {string} [label] for the error message
 * @returns {string} e.g. "1,7,12"
 */
function toIdList(value, label = 'identifier list') {
    const ids = toIdArray(value);
    if (ids.length === 0) {
        throw new ForbiddenError(`No valid ${label} in scope`);
    }
    return ids.join(',');
}

/**
 * A single integer safe to interpolate, for Sequelize.literal().
 */
function toInt(value, label = 'identifier') {
    const n = Number(value);
    if (!Number.isInteger(n)) {
        throw new ForbiddenError(`Invalid ${label}`);
    }
    return n;
}

module.exports = { toIdArray, toIdList, toInt };
