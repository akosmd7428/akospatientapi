const { QueryTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const { getAllowedCompanyPlan, getActiveCompanyPlan, planDate, todayInIndia } = require('./carePlanService');

/*
 * Free services under a company care plan. Add-on: it only applies when the patient's company (or its parent, the
 * plan owner) has worksman_company_list.is_plan_id_verify = 1; otherwise every caller goes on with its existing flow.
 *
 * Which plan:   the plan of the deeplink login (signed token claims ssoPlanId = careplans.plan_code, ssoCarePlanId =
 *               careplans.id), else the company's newest active plan that is valid today.
 * Allowance:    the plan's subscriptionPlans row for the service (planKey): planValue uses per patient per period.
 * Period:       planType 1 monthly, 2 quarterly, 3 annually, counted from the plan's validFrom (calendar periods when
 *               it has none); any other planType: one allowance for the whole validity of the plan.
 * Usage:        one row per use in subscription_plan_usage (patient, plan row, period); subscriptionPlans.avail_value
 *               is the running total of uses of that plan row over all patients.
 *
 * Every function returns null / does nothing on any problem (no plan, flag off, used up, db error), so the caller
 * keeps its existing flow.
 */

// planKey in subscriptionPlans for each service
const SERVICES = {
    labTests: 'labTests',               // lab test booking
    careAppointment: 'careAppointment', // book appointment
    practitioner: 'practitioner',       // talk to doctor
};
const isService = (service) => Object.prototype.hasOwnProperty.call(SERVICES, service);

const toCount = (value) => {
    const n = parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

/* ---------------------------------------------------------------- periods */

const PERIOD_MONTHS = { '1': 1, '2': 3, '3': 12 };
const pad = (n) => String(n).padStart(2, '0');
const parts = (ymd) => ymd.split('-').map(Number);
const addMonths = (ymd, months) => {
    const [y, m, d] = parts(ymd);
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`;
};

// first day (YYYY-MM-DD) of the period that contains `today`
const periodStart = (planType, validFrom, today = todayInIndia()) => {
    const months = PERIOD_MONTHS[String(planType)];
    const anchor = planDate(validFrom) || '';
    if (!months) return anchor || '2000-01-01'; // no repeating period: the whole validity of the plan
    if (anchor && anchor <= today) {
        const [ay, am, ad] = parts(anchor);
        const [ty, tm, td] = parts(today);
        const monthsSince = (ty - ay) * 12 + (tm - am) - (td < ad ? 1 : 0);
        let start = addMonths(anchor, Math.floor(monthsSince / months) * months);
        if (start > today) start = addMonths(start, -months);
        return start;
    }
    const [ty, tm] = parts(today);
    if (months === 1) return `${ty}-${pad(tm)}-01`;
    if (months === 3) return `${ty}-${pad(Math.floor((tm - 1) / 3) * 3 + 1)}-01`;
    return `${ty}-01-01`;
};

/* ---------------------------------------------------------------- plan lookup */

// the patient's company (a dependant uses its account holder's) with the parent company's flag
const getPatientCompany = async (patientId) => {
    const [row] = await sequelizeDB1.query(
        `SELECT w.id, w.parent_id, w.is_plan_id_verify, w.is_pament_required, parent.is_plan_id_verify AS parent_is_plan_id_verify
         FROM patient p
         LEFT JOIN patient holder ON holder.id = p.parent_id AND p.parent_id <> 0
         JOIN worksman_company_list w ON w.id = COALESCE(NULLIF(holder.companyId, 0), NULLIF(holder.employer_id, 0), NULLIF(p.companyId, 0), p.employer_id)
         LEFT JOIN worksman_company_list parent ON parent.id = w.parent_id AND w.parent_id <> 0
         WHERE p.id = :patientId
         LIMIT 1`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
    );
    return row || null;
};

// the plan that applies to the logged in patient for this service: { plan, source } or null
const resolvePlan = async (user, companyIds, planKey) => {
    const carePlanId = Number(user.ssoCarePlanId) || 0;
    const planId = user.ssoPlanId !== undefined && user.ssoPlanId !== null ? String(user.ssoPlanId) : '';
    if (carePlanId && planId) {
        // the plan of the deeplink login: it must still be assigned to the company and be usable today
        const { plan } = await getAllowedCompanyPlan(planId, companyIds);
        return plan && Number(plan.id) === carePlanId ? { plan, source: 'deeplink' } : null;
    }
    // without a deeplink: the company's newest valid plan that includes this service
    const { plan } = await getActiveCompanyPlan(companyIds, planKey);
    return plan ? { plan, source: 'company' } : null;
};

/*
 * Uses of this plan row by the patient in the period.
 * labTests also counts the plan packages the patient already availed through the existing package flow
 * (subscription_plan_avail, type 'package', status 1, written by LabTestService.updateLabOrder when a plan package
 * order is confirmed): a plan of 5 lab tests with one package already availed leaves 4. A package booked through
 * this plan also gets such a row once it is confirmed; it is not counted twice (its order already has a usage row).
 */
const countUses = async (subscriptionPlanId, patientId, start, transaction, planKey = null, carePlanId = null) => {
    const [row] = await sequelizeDB1.query(
        `SELECT COUNT(*) AS n FROM subscription_plan_usage
         WHERE subscription_plan_id = :subscriptionPlanId AND patient_id = :patientId AND period_start = :start
           AND (reference_type IS NULL OR reference_type <> 'callPayment')`,
        { replacements: { subscriptionPlanId, patientId, start }, type: QueryTypes.SELECT, transaction }
    );
    let used = Number(row && row.n) || 0;
    if (planKey === SERVICES.labTests && carePlanId) {
        const [availed] = await sequelizeDB1.query(
            `SELECT COUNT(*) AS n FROM subscription_plan_avail a
             WHERE a.patient_id = :patientId AND a.care_plan_id = :carePlanId AND a.planKey = :planKey
               AND a.type = 'package' AND a.status = 1 AND a.created_at >= :start
               AND NOT EXISTS (
                   SELECT 1 FROM subscription_plan_usage u
                   JOIN labOrderDetails lod ON lod.labOrderId = CAST(u.reference_id AS UNSIGNED)
                   WHERE u.patient_id = a.patient_id AND u.reference_type = 'labOrder' AND lod.referenceId = a.reference_id
               )`,
            { replacements: { patientId, carePlanId, planKey, start }, type: QueryTypes.SELECT, transaction }
        );
        used += Number(availed && availed.n) || 0;
    }
    return used;
};

/*
 * The free allowance of `service` for the logged in patient (decoded login token, req.user / socket user):
 *   { service, patientId, companyId, subscriptionPlanId, carePlanId, planId, source, planValue, used, remaining,
 *     periodStart, paymentRequired }
 * or null when the plan does not apply. remaining can be 0 (used up for this period), the caller decides.
 */
const getAllowance = async (user, service) => {
    try {
        if (!user || user.role !== 'patient' || !isService(service)) return null;
        const company = await getPatientCompany(user.id);
        if (!company) return null;
        // the condition for all of this: is_plan_id_verify on the patient's company or its parent (the plan owner)
        if (Number(company.is_plan_id_verify) !== 1 && Number(company.parent_is_plan_id_verify) !== 1) return null;

        // from here on the company has is_plan_id_verify = 1: say why the plan does not apply (the existing flow is used)
        const resolved = await resolvePlan(user, [company.id, company.parent_id], SERVICES[service]);
        if (!resolved) {
            console.info(`[subscription] patient ${user.id} (company ${company.id}): no active, valid plan with ${service} for the company today - existing flow`);
            return null;
        }
        const { plan, source } = resolved;

        const [row] = await sequelizeDB1.query(
            `SELECT id, planValue, planType FROM subscriptionPlans
             WHERE packageId = :carePlanId AND planKey = :planKey AND isActive = 1 AND isDeleted = 0
             ORDER BY id LIMIT 1`,
            { replacements: { carePlanId: plan.id, planKey: SERVICES[service] }, type: QueryTypes.SELECT }
        );
        if (!row) {
            console.info(`[subscription] patient ${user.id}: plan ${plan.plan_code} has no active ${service} row in subscriptionPlans - existing flow`);
            return null;
        }

        const start = periodStart(row.planType, plan.validFrom);
        const planValue = toCount(row.planValue);
        const used = await countUses(row.id, user.id, start, undefined, SERVICES[service], plan.id);
        return {
            service,
            patientId: Number(user.id),
            companyId: Number(company.id),
            subscriptionPlanId: row.id,
            carePlanId: plan.id,
            planId: String(plan.plan_code),
            source,
            planValue,
            used,
            remaining: Math.max(0, planValue - used),
            periodStart: start,
            paymentRequired: Number(company.is_pament_required) === 1,
        };
    } catch (error) {
        // e.g. the subscription_plan_usage table is missing (migration not run): the plan cannot be checked
        console.error(`[subscription] allowance check failed (${service}) - existing flow:`, error.message);
        return null;
    }
};

/*
 * Take one free use of `service` when the patient still has one in this period. The plan row is locked while the
 * uses are counted, so two requests cannot both take the last one. Returns the allowance after the use, with
 * usageId, or null. onlyWhenPaymentRequired: calls and appointments only use the plan when the company would
 * otherwise charge for them.
 */
const useFree = async (user, service, { onlyWhenPaymentRequired = false, referenceType = null, referenceId = null } = {}) => {
    const allowance = await getAllowance(user, service);
    if (!allowance || allowance.remaining <= 0) return null;
    if (onlyWhenPaymentRequired && !allowance.paymentRequired) return null;

    let transaction;
    try {
        transaction = await sequelizeDB1.transaction();
        const [locked] = await sequelizeDB1.query(
            'SELECT id, planValue FROM subscriptionPlans WHERE id = :id FOR UPDATE',
            { replacements: { id: allowance.subscriptionPlanId }, type: QueryTypes.SELECT, transaction }
        );
        const used = await countUses(allowance.subscriptionPlanId, allowance.patientId, allowance.periodStart, transaction, SERVICES[service], allowance.carePlanId);
        if (!locked || used >= toCount(locked.planValue)) {
            await transaction.rollback();
            return null;
        }
        const [usageId] = await sequelizeDB1.query(
            `INSERT INTO subscription_plan_usage
                (patient_id, company_id, care_plan_id, subscription_plan_id, plan_key, period_start, reference_type, reference_id, created_at)
             VALUES (:patientId, :companyId, :carePlanId, :subscriptionPlanId, :planKey, :periodStart, :referenceType, :referenceId, NOW())`,
            {
                replacements: {
                    patientId: allowance.patientId, companyId: allowance.companyId, carePlanId: allowance.carePlanId,
                    subscriptionPlanId: allowance.subscriptionPlanId, planKey: SERVICES[service], periodStart: allowance.periodStart,
                    referenceType, referenceId: referenceId === null || referenceId === undefined ? null : String(referenceId),
                },
                type: QueryTypes.INSERT, transaction,
            }
        );
        // running total of this plan row over all patients
        await sequelizeDB1.query(
            `UPDATE subscriptionPlans SET avail_value = CAST(COALESCE(NULLIF(TRIM(avail_value), ''), '0') AS UNSIGNED) + 1 WHERE id = :id`,
            { replacements: { id: allowance.subscriptionPlanId }, type: QueryTypes.UPDATE, transaction }
        );
        await transaction.commit();
        const result = { ...allowance, usageId, used: used + 1, remaining: Math.max(0, allowance.planValue - used - 1) };
        console.info(`[subscription] patient ${result.patientId} used ${service} of plan ${result.planId} (${result.used}/${result.planValue} since ${result.periodStart})`);
        return result;
    } catch (error) {
        if (transaction) await transaction.rollback().catch(() => {});
        console.error(`[subscription] could not record the use (${service}):`, error.message);
        return null;
    }
};

// give a use back (the service could not be completed after it was taken)
const release = async (use) => {
    if (!use || !use.usageId) return;
    try {
        await sequelizeDB1.query('DELETE FROM subscription_plan_usage WHERE id = :id', { replacements: { id: use.usageId }, type: QueryTypes.DELETE });
        await sequelizeDB1.query(
            `UPDATE subscriptionPlans SET avail_value = CAST(COALESCE(NULLIF(TRIM(avail_value), ''), '0') AS UNSIGNED) - 1
             WHERE id = :id AND CAST(COALESCE(NULLIF(TRIM(avail_value), ''), '0') AS UNSIGNED) > 0`,
            { replacements: { id: use.subscriptionPlanId }, type: QueryTypes.UPDATE }
        );
    } catch (error) {
        console.error('[subscription] could not give the use back:', error.message);
    }
};

// link a use to what it was used for (e.g. the appointment id, known only after it was created)
const setReference = async (use, referenceType, referenceId) => {
    if (!use || !use.usageId) return;
    try {
        await sequelizeDB1.query(
            'UPDATE subscription_plan_usage SET reference_type = :referenceType, reference_id = :referenceId WHERE id = :id',
            { replacements: { id: use.usageId, referenceType, referenceId: String(referenceId) }, type: QueryTypes.UPDATE }
        );
    } catch (error) {
        console.error('[subscription] could not link the use:', error.message);
    }
};

/*
 * Talk to doctor: the call is "taken" when a doctor accepts it (acceptedCallByDoctor, doctor token). Everything is read
 * from the database at that moment, so it works with several server processes and across restarts:
 *   - the call: the patient's connect_waiting_room row that is 'In progress' (call_id)
 *   - the plan: the patient's deeplink plan when they logged in through a deeplink in the last day (ssoDeeplinkCode),
 *     else the company plan
 *   - one use per call: a call that already has a usage row is not counted again
 */
const DEEPLINK_PLAN_WINDOW_HOURS = 24; // the login token of a deeplink lives 1 day

const latestDeeplinkPlan = async (patientId) => {
    try {
        const [row] = await sequelizeDB1.query(
            `SELECT plan_code, care_plan_id FROM ssoDeeplinkCode
             WHERE patientId = :patientId AND usedAt IS NOT NULL AND plan_code IS NOT NULL AND care_plan_id IS NOT NULL
               AND usedAt >= DATE_SUB(NOW(), INTERVAL ${DEEPLINK_PLAN_WINDOW_HOURS} HOUR)
             ORDER BY usedAt DESC LIMIT 1`,
            { replacements: { patientId }, type: QueryTypes.SELECT }
        );
        return row ? { ssoPlanId: String(row.plan_code), ssoCarePlanId: Number(row.care_plan_id) } : {};
    } catch (error) {
        return {}; // no deeplink table / column: the company plan is used
    }
};

// kept for the socket ring event; the call is counted when the doctor accepts it (takePractitionerCall)
const notePractitionerCall = async () => {};

/*
 * Paid talk to doctor calls once the plan's free calls are used up. One payment (payment_for_call, call_type 1, Paid,
 * made today or yesterday) pays for one call: when the doctor accepts that call a row with reference_type
 * 'callPayment' and reference_id '<payment id>:<call id>' is stored. Those rows are not counted as free uses
 * (countUses) and do not change avail_value.
 */
const PAID_CALL = 'callPayment';

// id of the call the patient is in right now (connect_waiting_room)
const currentCallId = async (patientId) => {
    const [room] = await sequelizeDB1.query(
        `SELECT call_id FROM connect_waiting_room WHERE patient_id = :patientId AND status = 'In progress' ORDER BY id DESC LIMIT 1`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
    );
    return room && room.call_id ? String(room.call_id) : null;
};

// true when this call was already counted (free use or paid call), so accepting it again is fine
const isCallCounted = async (patientId, callId) => {
    if (!callId) return false;
    const [row] = await sequelizeDB1.query(
        `SELECT id FROM subscription_plan_usage
         WHERE patient_id = :patientId AND plan_key = :planKey
           AND ((reference_type = 'call' AND reference_id = :callId)
             OR (reference_type = '${PAID_CALL}' AND SUBSTRING_INDEX(reference_id, ':', -1) = :callId))
         LIMIT 1`,
        { replacements: { patientId, planKey: SERVICES.practitioner, callId: String(callId) }, type: QueryTypes.SELECT }
    );
    return !!row;
};

// a paid talk to doctor payment of the patient that no call has used yet (id), else null
const unusedCallPayment = async (patientId) => {
    try {
        const [row] = await sequelizeDB1.query(
            `SELECT p.id FROM payment_for_call p
             WHERE p.patient_id = :patientId AND p.call_type = 1 AND p.payment_status = 'Paid'
               AND p.call_date >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
               AND NOT EXISTS (
                   SELECT 1 FROM subscription_plan_usage u
                   WHERE u.patient_id = p.patient_id AND u.reference_type = '${PAID_CALL}'
                     AND CAST(SUBSTRING_INDEX(u.reference_id, ':', 1) AS UNSIGNED) = p.id
               )
             ORDER BY p.id ASC LIMIT 1`,
            { replacements: { patientId }, type: QueryTypes.SELECT }
        );
        return row ? row.id : null;
    } catch (error) {
        console.error('[subscription] could not read the call payments:', error.message);
        return null;
    }
};

/*
 * Can the patient talk to the doctor now (company with is_plan_id_verify = 1)?
 *   1. the care plan of the logged in user (deeplink plan, else the company's active plan)
 *   2. its practitioner row in subscriptionPlans (planValue) and the uses in subscription_plan_usage this period
 *   3. a free call left -> allowed (free); used up -> allowed only with a paid call payment not used by a call yet
 * { allowed, free, paymentId, allowance }. Flag 0, no plan, no practitioner row or any error: allowed (existing flow).
 */
const checkPractitionerCall = async (patientId, callId = null) => {
    const allowed = { allowed: true, free: false, paymentId: null, allowance: null };
    try {
        const id = Number(patientId);
        if (!id || !await isPlanVerifyPatient(id)) return allowed;
        if (await isCallCounted(id, callId || await currentCallId(id))) return allowed; // this call is already counted
        const user = { id, role: 'patient', ...(await latestDeeplinkPlan(id)) };
        const allowance = await getAllowance(user, 'practitioner');
        if (!allowance) return allowed;
        if (allowance.remaining > 0) return { ...allowed, free: true, allowance };
        const paymentId = await unusedCallPayment(id);
        if (paymentId) return { ...allowed, paymentId, allowance };
        console.info(`[subscription] patient ${id}: free calls of plan ${allowance.planId} used up (${allowance.used}/${allowance.planValue}), call not paid - call refused`);
        return { allowed: false, free: false, paymentId: null, allowance };
    } catch (error) {
        console.error('[subscription] could not check the call:', error.message);
        return allowed;
    }
};

// the doctor accepted the call: one free use of the plan, else the paid call payment is marked as used by this call
const takePractitionerCall = async (patientId) => {
    try {
        const id = Number(patientId);
        if (!id || !await isPlanVerifyPatient(id)) return null; // is_plan_id_verify = 0: nothing changes
        const callId = await currentCallId(id);
        if (await isCallCounted(id, callId)) return null; // the same call accepted twice
        const user = { id, role: 'patient', ...(await latestDeeplinkPlan(id)) };
        const freeUse = await useFree(user, 'practitioner', { referenceType: 'call', referenceId: callId });
        if (freeUse) return freeUse;

        // no free call left: the call is paid, link the payment to it so it pays for one call only
        const allowance = await getAllowance(user, 'practitioner');
        const paymentId = allowance ? await unusedCallPayment(id) : null;
        if (!paymentId) return null;
        await sequelizeDB1.query(
            `INSERT INTO subscription_plan_usage
                (patient_id, company_id, care_plan_id, subscription_plan_id, plan_key, period_start, reference_type, reference_id, created_at)
             VALUES (:patientId, :companyId, :carePlanId, :subscriptionPlanId, :planKey, :periodStart, '${PAID_CALL}', :referenceId, NOW())`,
            {
                replacements: {
                    patientId: id, companyId: allowance.companyId, carePlanId: allowance.carePlanId,
                    subscriptionPlanId: allowance.subscriptionPlanId, planKey: SERVICES.practitioner,
                    periodStart: allowance.periodStart, referenceId: `${paymentId}:${callId || ''}`,
                },
                type: QueryTypes.INSERT,
            }
        );
        console.info(`[subscription] patient ${id}: paid call (payment ${paymentId}, call ${callId})`);
        return null;
    } catch (error) {
        console.error('[subscription] could not count the call:', error.message);
        return null;
    }
};

// true when the patient's company (or its parent company) has worksman_company_list.is_plan_id_verify = 1
const isPlanVerifyPatient = async (patientId) => {
    const company = await getPatientCompany(patientId);
    return !!company && (Number(company.is_plan_id_verify) === 1 || Number(company.parent_is_plan_id_verify) === 1);
};

module.exports = { SERVICES, isService, isPlanVerifyPatient, periodStart, getAllowance, useFree, release, setReference, notePractitionerCall, takePractitionerCall, checkPractitionerCall, unusedCallPayment };
