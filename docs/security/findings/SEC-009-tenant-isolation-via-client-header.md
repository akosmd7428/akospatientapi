# SEC-009 — Multi-tenant isolation depends on a client-supplied `companyId` header

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 8.8 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A01:2021 – Broken Access Control |
| OWASP ASVS 4.0.3 | V4.2.1 – Protection against IDOR; V4.1.2 – Access control cannot be manipulated by parameter tampering; V4.1.3 – Least privilege |
| CWE | CWE-639 – Authorization Bypass Through User-Controlled Key; CWE-863 – Incorrect Authorization |
| Status | Open |
| Affected component | `index.js`, `controllers/hrController.js`, `controllers/careNavigatorController.js`, `controllers/chatController.js`, `middleware/jwtAuthCareNavigator.js` |

## Summary

The platform serves multiple employer tenants, and the boundary between them is a `companyId` **HTTP request header**. Approximately twenty HR and care-navigator endpoints scope their queries by this header. It is never compared against the authenticated user's own company, and it is never validated.

Changing one header value moves a user from their own tenant's data to another's. An HR user at company A sets `companyId: B` and reads company B's complete employee health dataset — pre-employment assessments, cardiac and diabetic risk records, lab results and prescriptions.

The care-navigator middleware makes the intent unmistakable: it reads the header into a variable named `careNavCompanyId` and then never references it again.

## Affected code

`index.js:52` — the header is explicitly admitted through CORS so browsers will send it:

```js
allowedHeaders: ['Content-Type', 'Authorization','role','companyId'],
```

`middleware/jwtAuthCareNavigator.js:8` — read, then discarded:

```js
const careNavCompanyId = req.header('companyId') || null;   // never used again in this file
```

`controllers/hrController.js:107-111` — a representative consumer:

```js
static async getPreEmployeeList(req, res) {
    const { status, search } = req.query;
    const companyId_header = req.header('companyId');                                       // :107
    const userDetails = await PreEmployeePatientService.getPreEmployeeList(companyId_header, status, search);   // :109
```

There is no query of the form "does this user belong to this company?" anywhere in the request path.

**The full set of consumers:**

| File | Lines |
|---|---|
| `controllers/hrController.js` | 72, 86, 107-111, 130-133, 149-151, 208-211, 226-229, 251-252, 267, 282, 289, 333 |
| `controllers/careNavigatorController.js` | 53, 212, 223, 239, 249, 294, 462 |
| `controllers/chatController.js` | 22 |

Several of these are **write** paths, not just reads: `hrController.js:248-252` mutates employee status, and `hrController.js:393`/`:494` update lab orders and write prescriptions into patient folders.

The same header is also the SQL injection vector documented in [SEC-006](SEC-006-sql-injection.md) — it is interpolated into `IN (...)` clauses in eleven raw queries. The two findings share a root cause and a fix.

## Technical detail

Tenant scope is an authorisation decision and must therefore derive from server-side state — the authenticated session — not from the request. Here the scope value arrives in the same HTTP message as the credential, under the attacker's full control.

Three factors make this trivially exploitable:

1. **The token does not carry the company.** `services/authService.js:68` signs `{ id, email, role }`. There is no `companyId` claim, so even a diligent handler could not compare the header against the token. The information needed to enforce the boundary is not present in the session.
2. **No lookup is performed.** No handler queries the user's own company from the database to validate the header against it. The header is passed straight to the service layer.
3. **Company ids are small integers.** Enumeration is a `for` loop from 1 upward.

Compounding with [SEC-001](SEC-001-broken-role-enforcement.md): because the role middlewares enforce nothing, the attacker need not even be an HR user. Any patient can reach the HR endpoints, and then set `companyId` to any value. The combination turns a cross-tenant leak between privileged users into a full PHI dump available to any registered patient.

Note also that the header accepts a **list** (`IN (${careCompanyIds})`), so `companyId: 1,2,3,4,5` returns several tenants in one request — and `companyId: 1,2,3,...,500` may return all of them.

## Exploit scenario

1. Attacker authenticates as any user — a patient account suffices, given SEC-001. They receive a token.
2. Attacker calls an HR endpoint with their own token and an arbitrary company:
   ```
   GET /api/hr/preemployeelist?status=all
   Authorization: Bearer <any valid token>
   role: patient
   companyId: 2
   ```
3. The response contains company 2's full pre-employment health record list: names, contact details, assessment outcomes and risk classifications.
4. Attacker scripts `for companyId in $(seq 1 500)` and harvests every tenant on the platform.
5. Using the list form, `companyId: 1,2,3,...,500` may return the entire dataset in a single request.
6. Attacker pivots to write operations — `hrController.js:251` to change employee status, `:494` to insert prescriptions into arbitrary patients' folders.

For a platform selling tenancy isolation to employers, this is the failure mode with the greatest commercial and contractual consequence: every tenant's data is visible to every other tenant's users, and to any patient.

## Impact

- **Confidentiality:** complete cross-tenant disclosure of employee health data. For an occupational-health product, this breaches the core contractual guarantee to every employer customer simultaneously.
- **Integrity:** cross-tenant writes — employee status changes, lab order modification, prescription insertion.
- **Availability:** not directly affected.
- **Contractual/regulatory:** a cross-tenant PHI leak is reportable, and typically triggers notification obligations to **every** affected employer, not just one. Data-processing agreements almost always warrant against exactly this.

## Remediation

The correct fix is not to validate the header — it is to remove it. Tenant scope must travel inside the signed token.

**Step 1 — put the company in the token at sign time.**

```js
// services/authService.js
const companyIds = await resolveCompanyScope(user, roleName);   // e.g. [7] for HR, [7,9] for a multi-company navigator

const token = jwt.sign(
    { id: user.id, email: user.email, role: roleName, companyIds },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'patientportalapi', audience: 'patientportal' }   // see SEC-017
);
```

`resolveCompanyScope` reads the authoritative mapping from the database at login. If a user's company assignment changes, the change takes effect on their next token — which is why the short expiry in SEC-017 matters here too.

**Step 2 — surface it on `req.user` and use only that.**

`middleware/requireAuth.js` (see [SEC-001](SEC-001-broken-role-enforcement.md)) already copies claims onto `req.user`. Handlers become:

```js
static async getPreEmployeeList(req, res) {
    const { status, search } = req.query;
    const companyIds = req.user.companyIds;                    // server-derived, from the signed token
    const userDetails = await PreEmployeePatientService.getPreEmployeeList(companyIds, status, search);
    ...
}
```

**Step 3 — bind it as a parameter in the service layer**, which simultaneously closes [SEC-006](SEC-006-sql-injection.md):

```js
const rows = await sequelizeDB1.query(
    `SELECT ... FROM patient p WHERE ... AND p.employer_id IN (:companyIds)`,
    { type: QueryTypes.SELECT, replacements: { companyIds } }
);
```

**Step 4 — remove the header entirely.**

```diff
--- a/index.js
-  allowedHeaders: ['Content-Type', 'Authorization','role','companyId'],
+  allowedHeaders: ['Content-Type', 'Authorization'],
```

Then delete every `req.header('companyId')` call site, including the unused read at `middleware/jwtAuthCareNavigator.js:8`.

**Step 5 — where a user legitimately spans several companies** and needs to *select* one for the UI, treat the selection as a filter **within** their authorised set, never as the scope itself:

```js
const requested = Number(req.query.companyId);
const scope = Number.isInteger(requested)
    ? req.user.companyIds.filter(id => id === requested)   // intersection with the authorised set
    : req.user.companyIds;
if (scope.length === 0) return res.status(403).send({ message: messages.forbidden });
```

**Step 6 — add a defence-in-depth check at the data layer.** A Sequelize default scope or a repository wrapper that requires an explicit company filter on every tenant-scoped model makes an unscoped query fail loudly rather than silently returning everything.

## Verification

1. **Cross-tenant test:** authenticate as an HR user of company A, send `companyId: B`. Must return 403 or only company A's data — never company B's. Before the fix it returns company B's data.
2. **Header removal:** `grep -rn "req.header('companyId')" --include=*.js . | grep -v node_modules` returns nothing.
3. **Token claim:** decode a freshly issued token and confirm it contains `companyIds`.
4. **List-injection test:** send `companyId: 1,2,3` — must have no effect on the result set.
5. **Privilege test:** authenticate as a patient and call an HR endpoint. Must return 403 (this also verifies [SEC-001](SEC-001-broken-role-enforcement.md)).
6. **Data-layer check:** temporarily remove the company filter from one query and confirm the repository wrapper rejects it rather than returning all tenants.

## References

- OWASP Top 10 2021 — [A01:2021 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- OWASP API Security Top 10 2023 — API1:2023 Broken Object Level Authorization
- OWASP ASVS 4.0.3 — V4.2 Operation Level Access Control
- CWE-639 — [Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
