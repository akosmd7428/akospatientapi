# SEC-011 — Broken object-level authorization (IDOR) across 15+ endpoints

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 8.1 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A01:2021 – Broken Access Control |
| OWASP ASVS 4.0.3 | V4.2.1 – Protection against IDOR; V4.1.2 – Access control not manipulable by parameter tampering |
| CWE | CWE-639 – Authorization Bypass Through User-Controlled Key |
| Status | Open |
| Affected component | `controllers/appointmentController.js`, `carePlanController.js`, `labTestController.js`, `dataController.js`, `vitalMonitoringController.js`, `patientController.js`, `patientAssessmentController.js`, `careNavigatorController.js`, `hrController.js` |

## Summary

Across at least fifteen endpoints, the object being acted on is selected by an identifier taken from the request body, path or query — and no check confirms that the authenticated caller owns or may access that object. This applies even on routes that *do* carry authentication: the token proves who the caller is, and then the handler ignores it in favour of a client-supplied `patientId`.

Any authenticated user can substitute another user's identifier and read or modify that user's clinical records, vitals, lab orders, prescriptions and care plans.

The codebase demonstrably knows the correct pattern — `appointmentController.js:47`, `patientFolderController.js:10,23` and `patientCareTeamController.js:9,24` all derive the subject from the session — which makes this inconsistent application rather than an unknown technique.

## Affected code

A representative sample; the pattern repeats.

`controllers/appointmentController.js:11` — book an appointment as any patient:

```js
const { patientId, doctorId, date, time, is_paid } = req.body;   // patientId from the body
```
Route: `routes/appointmentRoutes.js:8`. Repeated at `:32` (`checkAppointmentStatus`) and `:355` (`fetchDoctorIds`).

`controllers/dataController.js:178-180` — the most directly damaging instance. `patientId` from the body is used in a raw query selecting the patient's demographics:

```js
const { patientId, call_id } = req.body;
// ... raw SELECT of gender, age, height, weight, dateofbirth, first_name, last_name, email, city, state, phone
```
Route: `routes/dataRoutes.js:10`.

`controllers/vitalMonitoringController.js:21,33,54,64` — `patient_id` from query and body, for both **read and write** of vital signs. Route: `routes/vitalMonitoringRoutes.js:8,9,10`.

`controllers/patientController.js:380-395` and `:397-415` — the handler validates only that `patientId` is *present*, then passes the whole body through:

```js
if (!req.body.patientId) { throw new Error(...); }     // presence, not ownership
await PatientService.updateProfile(req.body);          // :387
```
`services/patientService.js:945-948` then runs `PatientDetail.update(data, { where: { patientId: data.patientId } })` — the body selects the target row. This is simultaneously the mass assignment of [SEC-013](SEC-013-mass-assignment.md).

`controllers/labTestController.js` — `patientId`/`orderId`/`prescriptionId` from the request at `:20, 52, 63, 74, 142, 152, 171, 327, 404`. `:152` deletes a prescription by id with no owner check.

`controllers/carePlanController.js:9-11` — `const { companyId, patientId } = req.query;` returns any patient's care plan.

`controllers/careNavigatorController.js:302-317, 319-331, 405-420` and `controllers/hrController.js:393, 410, 494, 574-575` — `orderId`/`patientId` from the body: update any lab order, attach any lab report URL, write a prescription into any patient's folder.

**The correct pattern, already present in this codebase** — `controllers/patientFolderController.js:10`:

```js
const patientId = req.user.id;    // derived from the verified token
```

## Technical detail

Authentication answers *who is calling*; object-level authorization answers *may this caller act on this object*. These handlers perform the first and skip the second.

Two distinct sub-cases need different fixes:

**Case A — the subject is the caller.** Endpoints like "my vitals", "my appointments", "my profile" should not accept an identifier at all. The parameter is redundant, and accepting it creates the vulnerability. The fix is to delete the parameter and read `req.user.id`.

**Case B — the subject is legitimately another user.** A care navigator reading their assigned patient's record is a valid operation. Here the identifier must stay, but an explicit authorization query must confirm the relationship — is this patient assigned to this navigator, within the navigator's company? — before the object is touched.

Conflating the two is what produced this pattern: handlers were written to accept `patientId` so that clinician workflows would work, and the patient-facing routes inherited the same shape.

Severity compounds sharply with other findings. With [SEC-001](SEC-001-broken-role-enforcement.md) any patient reaches the clinician endpoints; with [SEC-009](SEC-009-tenant-isolation-via-client-header.md) they reach every tenant; with [SEC-008](SEC-008-unauthenticated-sensitive-routes.md) several of these endpoints need no authentication at all. Rated High rather than Critical only because the base case requires *some* valid account.

## Exploit scenario

1. Attacker registers as a patient and authenticates normally. Their own id is 4821.
2. Attacker calls `POST /api/data/patient-call-detail` with `{ "patientId": 1, "call_id": 1 }`.
3. The response returns patient 1's name, date of birth, gender, email, phone, height, weight, city and state — the record belongs to someone else entirely.
4. Attacker iterates `patientId` from 1 upward, harvesting the demographic record of every patient on the platform.
5. Attacker escalates to writes: `POST /api/patient/update-notes` with `{ "patientId": 1, "notes": "..." }` overwrites another patient's clinical notes; `POST /api/vital-monitoring/...` falsifies their vital signs.
6. Falsified vitals or notes in a record used for clinical decisions is a patient-safety issue, not merely a data-integrity one.

## Impact

- **Confidentiality:** any authenticated user can enumerate and read every patient's demographics, vitals, lab orders, prescriptions and care plans.
- **Integrity:** the same identifiers permit writes — clinical notes, vitals, lab orders, appointments and prescriptions can be modified for arbitrary patients.
- **Patient safety:** falsified clinical data in records used for care decisions.
- **Regulatory:** HIPAA §164.312(a)(1) requires access to be limited to those with a need; sequential-integer enumeration of the full patient population is the opposite.

## Remediation

**Step 1 — classify every endpoint** as Case A (subject is the caller) or Case B (subject is another user, by relationship). Do this as an explicit inventory before changing code; the inventory is the deliverable that prevents a partial fix.

**Step 2 — Case A: delete the parameter.**

```js
// controllers/vitalMonitoringController.js
static async getVitals(req, res) {
    const patientId = req.user.id;        // not req.query.patient_id
    const vitals = await VitalMonitoringService.getVitals(patientId);
    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.success, vitals);
}
```

Remove `patient_id` from the route's validation schema so a client sending it gets a clear error rather than silent ignoring.

**Step 3 — Case B: add an explicit authorization check.** Centralise it so it cannot be forgotten:

```js
// helpers/authorization.js
const { ROLES } = require('../middleware/requireAuth');

async function assertCanAccessPatient(user, patientId) {
    const id = Number(patientId);
    if (!Number.isInteger(id)) throw new ForbiddenError();

    if (user.role === ROLES.PATIENT) {
        if (id !== user.id) throw new ForbiddenError();
        return id;
    }
    if (user.role === ROLES.CARE_NAVIGATOR) {
        const assigned = await PatientCareTeam.count({
            where: { patientId: id, careNavigatorId: user.id },
        });
        if (!assigned) throw new ForbiddenError();
        return id;
    }
    if (user.role === ROLES.HR) {
        const inScope = await Patient.count({
            where: { id, employer_id: { [Op.in]: user.companyIds } },   // token-derived — see SEC-009
        });
        if (!inScope) throw new ForbiddenError();
        return id;
    }
    throw new ForbiddenError();
}
module.exports = { assertCanAccessPatient };
```

Usage:

```js
static async getLabOrders(req, res) {
    const patientId = await assertCanAccessPatient(req.user, req.params.patientId);
    const orders = await LabTestService.getLabOrdersByPatientId(patientId);
    ...
}
```

Add the equivalent `assertCanAccessOrder`, `assertCanAccessPrescription` and `assertCanAccessAppointment` — each resolving the object, then checking its owning patient through `assertCanAccessPatient`.

**Step 4 — enforce at the data layer as well.** A repository wrapper that requires an explicit actor argument means an unscoped query fails rather than returning another patient's row. Belt and braces: the controller check can be forgotten; the data-layer check cannot be, because the query will not compile without it.

**Step 5 — return 403 uniformly**, with an identical response body and timing whether the object does not exist or is not permitted. Differentiating the two reintroduces enumeration ([SEC-028](SEC-028-account-enumeration.md)).

**Step 6 — consider non-sequential identifiers.** The `patientModel` already has a `uuid` column. Exposing UUIDs instead of auto-increment ids raises the cost of enumeration substantially. This is hardening, not a fix — authorization checks remain mandatory.

## Verification

1. **Horizontal test, per endpoint:** authenticate as patient A, substitute patient B's id. Every endpoint must return 403. Build this as an automated suite — one test per endpoint in the Step 1 inventory — so it runs on every change.
2. **Enumeration test:** script `patientId` 1–1000 against `POST /api/data/patient-call-detail`. Expect 403 for all but the caller's own.
3. **Write test:** attempt `update-notes` for another patient; confirm 403 **and** that the target row is unchanged in the database.
4. **Case B positive test:** a care navigator with a genuine assignment can still read that patient; the same navigator cannot read an unassigned patient.
5. **Static check:** `grep -rnE "req\.(body|params|query)\.(patientId|patient_id)" controllers/ | grep -v node_modules` — every remaining hit must pass through `assertCanAccessPatient`.
6. **Uniformity:** confirm 403 responses for "does not exist" and "not permitted" are byte-identical.

## References

- OWASP API Security Top 10 2023 — [API1:2023 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- OWASP — [Insecure Direct Object Reference Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V4.2 Operation Level Access Control
- CWE-639 — [Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
