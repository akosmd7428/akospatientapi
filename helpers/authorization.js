'use strict';

/**
 * Object-level authorization.
 *
 * SEC-011: across 15+ endpoints the object being acted on was chosen by an
 * identifier from the request body, path or query, with no check that the
 * authenticated caller owned or could access it. The token proved who was
 * calling, and the handler then ignored it.
 *
 * Two cases, deliberately distinguished:
 *   A. the subject IS the caller  -> the parameter should not exist; use req.user.id
 *   B. the subject is another user -> keep the parameter, but verify the relationship
 *
 * Everything here handles case B. Case A is fixed at the call site.
 *
 * SEC-028: a failed check always raises ForbiddenError with the same message,
 * whether the object is missing or merely not permitted, so 403-versus-404
 * cannot be used to enumerate.
 */

const { Op } = require('sequelize');
const { ForbiddenError } = require('./errors');
const { ROLES } = require('../middleware/requireAuth');

const Patient = require('../models/patientModel');

function toId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new ForbiddenError();
    return id;
}

/**
 * Resolve and authorise a patient id supplied by the caller.
 * @param {{id:number, role:string, companyIds:number[]}} user from req.user
 * @param {*} patientId from the request
 * @returns {Promise<number>} the validated patient id
 */
async function assertCanAccessPatient(user, patientId) {
    const id = toId(patientId);

    if (!user || typeof user.role !== 'string') throw new ForbiddenError();

    if (user.role === ROLES.PATIENT) {
        if (id !== Number(user.id)) throw new ForbiddenError();
        return id;
    }

    // There is no per-navigator patient assignment table in this schema
    // (patientCareTeam links patient to doctor), so the company a patient belongs
    // to is the authoritative boundary for both staff roles.
    if (user.role === ROLES.CARE_NAVIGATOR || user.role === ROLES.HR) {
        if (!Array.isArray(user.companyIds) || user.companyIds.length === 0) {
            throw new ForbiddenError();
        }
        const inScope = await Patient.count({
            where: {
                id,
                [Op.or]: [
                    { employer_id: { [Op.in]: user.companyIds } },
                    { companyId: { [Op.in]: user.companyIds } },
                ],
            },
        });
        if (inScope === 0) throw new ForbiddenError();
        return id;
    }

    throw new ForbiddenError();
}

/**
 * Authorise a record that belongs to a patient, by resolving the record first
 * and then checking its owner. Use for lab orders, prescriptions, appointments.
 *
 * @param {object} user req.user
 * @param {object} Model a Sequelize model
 * @param {*} recordId
 * @param {string} [ownerField='patientId']
 */
async function assertCanAccessRecord(user, Model, recordId, ownerField = 'patientId') {
    const id = toId(recordId);

    const record = await Model.findByPk(id);
    // Same error for "missing" and "not yours".
    if (!record) throw new ForbiddenError();

    await assertCanAccessPatient(user, record[ownerField]);
    return record;
}

/**
 * SEC-009: the set of companies a request may read, derived from the token.
 * Optionally narrowed by a caller-supplied selection, which is intersected with
 * the authorised set rather than trusted.
 */
function resolveCompanyScope(user, requestedCompanyId) {
    const authorised = Array.isArray(user && user.companyIds) ? user.companyIds.map(Number) : [];
    if (authorised.length === 0) throw new ForbiddenError();

    if (requestedCompanyId === undefined || requestedCompanyId === null || requestedCompanyId === '') {
        return authorised;
    }

    const requested = Number(requestedCompanyId);
    if (!Number.isInteger(requested)) throw new ForbiddenError();

    const scope = authorised.filter((id) => id === requested);
    if (scope.length === 0) throw new ForbiddenError();
    return scope;
}

module.exports = {
    assertCanAccessPatient,
    assertCanAccessRecord,
    resolveCompanyScope,
};
