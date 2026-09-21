# SEC-012 — Impersonation endpoint mints a patient token for any `patientId`

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 8.1 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A01:2021 – Broken Access Control |
| OWASP ASVS 4.0.3 | V4.2.1 – Protection against IDOR; V7.1.3 – Security-relevant events are logged; V3.3.1 – Session termination |
| CWE | CWE-863 – Incorrect Authorization; CWE-639 – Authorization Bypass Through User-Controlled Key |
| Status | Open |
| Affected component | `controllers/careNavigatorController.js`, `routes/careNavigatorRoutes.js`, `validation/authValidation.js` |

## Summary

`POST /api/careNavigator/login` accepts a `patientId` in the request body and returns a **full 24-hour patient JWT** for that patient, together with their complete profile. There is no check that the requesting care navigator is assigned to that patient, no check that the patient belongs to the navigator's company, and no audit record of the impersonation.

The route does carry `jwtAuthCareNavigator` — but that middleware enforces no role ([SEC-001](SEC-001-broken-role-enforcement.md)), so **any** authenticated user, including an ordinary patient, can call it. Iterating `patientId` from 1 upward yields a valid session token for every patient on the platform.

The resulting token is indistinguishable from a genuine patient login. Once issued, nothing downstream can tell that the session is an impersonation.

## Affected code

`routes/careNavigatorRoutes.js:26`:

```js
router.post('/login', validateDataEncryption(), validateSchema(loginPatientSchema), jwtAuthCareNavigator, CareNavigatorController.login);
```

`controllers/careNavigatorController.js:378-399`:

```js
static async login(req, res, next) {
    try {
        const { patientId } = req.body;                                    // :380  caller-chosen
        let userDetails;
        //Login as Patient after first time
        const patient = await Patient.findOne({ where: { id: patientId } });   // :383  no scoping
        if (patient) {
            let { token } = await AuthService.patientLogin(patient);       // :385  full patient JWT
            userDetails = await PatientService.getPatientDetailsByEmail(patient.email, patient);
            ...
            userDetails.currentRole = "patient";
            const loggedBy = "careNavigator";                              // :392  recorded in the response only
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, userDetails, loggedBy });
        } else {
            throw new Error("Invalid Patient Id");                         // :394  enumeration oracle
        }
    } catch (error) { ... }
}
```

`services/authService.js:73-77` — the minted token carries no marker of its origin:

```js
static async patientLogin(patient) {
    const token = jwt.sign({ id: patient.id, email: patient.email, role: "patient" }, process.env.JWT_SECRET, { expiresIn: '1d' });
    return { token };
}
```

`validation/authValidation.js:15-17` — the only constraint is that `patientId` is a number:

```js
const loginPatientSchema = Joi.object({
    patientId: Joi.number()
});
```

## Technical detail

Support impersonation ("log in as this user") is a legitimate feature in clinical software, but it is one of the most privileged operations a system can offer and requires four controls. None is present:

1. **Relationship check.** The navigator must be assigned to the patient, or at minimum within the same tenant. `Patient.findOne({ where: { id: patientId } })` applies no filter whatsoever.
2. **Role enforcement.** The middleware must genuinely require the care-navigator role. It does not ([SEC-001](SEC-001-broken-role-enforcement.md)).
3. **Audit trail.** Every impersonation must be recorded — who, whom, when, why — and be reportable to the patient. `loggedBy: "careNavigator"` is placed in the *response body* and persisted nowhere.
4. **Token distinguishability.** The issued token must carry an `act` (actor) claim so downstream authorisation and logging can tell an impersonated session apart and restrict it. The minted token is byte-for-byte the shape of a genuine patient login.

The third and fourth failures are what make this finding serious beyond the access-control bypass: even a *correctly authorised* impersonation here would be untraceable and unrestricted.

The error at `:394` (`"Invalid Patient Id"`) versus a success response also makes the endpoint a patient-existence oracle ([SEC-028](SEC-028-account-enumeration.md)).

## Exploit scenario

1. Attacker registers as an ordinary patient and authenticates. They hold a token with `role: "patient"`.
2. Attacker calls the impersonation endpoint with their own token:
   ```
   POST /api/careNavigator/login
   Authorization: Bearer <patient token>
   role: patient

   { "patientId": 1 }
   ```
3. `jwtAuthCareNavigator` verifies the signature and compares `"patient" != "patient"` → passes ([SEC-001](SEC-001-broken-role-enforcement.md)).
4. The response contains a valid 24-hour JWT for patient 1, plus their full profile.
5. Attacker uses that token against every patient-facing endpoint — records, prescriptions, appointments, chat — as patient 1.
6. Attacker loops `patientId` 1…N, collecting a valid session token for every patient on the platform. Each is valid for 24 hours and cannot be revoked ([SEC-017](SEC-017-jwt-hardening-gaps.md)).
7. No log anywhere records that the sessions were impersonated.

## Impact

- **Confidentiality:** a valid session for every patient account, obtainable in bulk by any authenticated user.
- **Integrity:** full write access as the impersonated patient — appointments, assessments, profile, uploads.
- **Non-repudiation:** actions taken under an impersonated token are indistinguishable from the patient's own. Any dispute over who entered or changed clinical data becomes unresolvable.
- **Regulatory:** HIPAA §164.312(b) requires audit controls recording activity in systems containing PHI; unlogged impersonation fails it. §164.308(a)(1)(ii)(D) information-system activity review is likewise unsatisfiable.

## Remediation

**Step 1 — decide whether the feature is needed.** If care navigators do not operationally require patient impersonation, delete the route and the handler. That is the safest outcome and should be the default answer.

**Step 2 — if it is needed, rebuild it with all four controls.**

```js
static async impersonatePatient(req, res) {
    const actor = req.user;                                   // verified token, role enforced by requireAuth(ROLES.CARE_NAVIGATOR)
    const patientId = Number(req.body.patientId);
    const reason = String(req.body.reason || '').trim();

    if (!Number.isInteger(patientId)) return forbidden(res);
    if (reason.length < 10) {
        return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.reasonRequired);
    }

    // 1. Relationship check — assignment AND tenant, not just existence.
    const assigned = await PatientCareTeam.count({ where: { patientId, careNavigatorId: actor.id } });
    if (!assigned) return forbidden(res);                     // identical response to "not found"

    const patient = await Patient.findOne({
        where: { id: patientId, employer_id: { [Op.in]: actor.companyIds } },
    });
    if (!patient) return forbidden(res);

    // 2. Audit BEFORE issuing — if the write fails, no token is minted.
    const audit = await ImpersonationLog.create({
        actorId: actor.id, actorRole: actor.role,
        subjectId: patient.id, reason,
        ip: getClientIp(req), startedAt: new Date(),
    });

    // 3. A distinguishable, short-lived, restricted token.
    const token = jwt.sign(
        {
            id: patient.id,
            role: 'patient',
            act: { sub: actor.id, role: actor.role, log: audit.id },   // RFC 8693 actor claim
            scope: ['read:record', 'write:notes'],                     // narrower than a real login
        },
        JWT_SECRET,
        { expiresIn: '15m', issuer: 'patientportalapi', audience: 'patientportal' }
    );

    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.success, { token });
}
```

**Step 3 — make downstream code act on the `act` claim.**

- `requireAuth` copies `act` onto `req.user`. Any handler performing a sensitive write (password change, payment, consent) must refuse when `req.user.act` is present.
- The audit logger records `act.sub` alongside `id` on every request, so the actor appears in the trail for every action taken under the session.
- The UI displays a persistent impersonation banner.

**Step 4 — notify the patient.** Impersonation events should be visible to the patient in their account activity, and ideally emailed. This is both a trust measure and a detection control.

**Step 5 — rename the route.** `/login` implies authentication; `/impersonate` states what it does. Clear naming is why this endpoint was not scrutinised earlier.

## Verification

1. **Role test:** with a patient token, call the endpoint. Must return 403. Before the fix it returns a token.
2. **Relationship test:** with a genuine care-navigator token, request a patient *not* assigned to that navigator. Must return 403.
3. **Tenant test:** request a patient assigned to the navigator but in a different company. Must return 403.
4. **Audit test:** a successful impersonation writes an `ImpersonationLog` row containing actor, subject, reason, IP and timestamp — verify the row exists before the response is sent.
5. **Token shape:** decode the issued token; it must contain `act`, a narrowed `scope`, and an expiry of 15 minutes, not 1 day.
6. **Restriction test:** using an impersonation token, attempt a password change. Must be refused.
7. **Uniformity:** confirm the 403 for "not assigned" and for "does not exist" are identical in body and timing.

## References

- OWASP Top 10 2021 — [A01:2021 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- RFC 8693 §4.1 — [`act` (actor) claim](https://datatracker.ietf.org/doc/html/rfc8693#section-4.1)
- OWASP ASVS 4.0.3 — V7.1 Log Content; V4.2 Operation Level Access Control
- CWE-863 — [Incorrect Authorization](https://cwe.mitre.org/data/definitions/863.html)
