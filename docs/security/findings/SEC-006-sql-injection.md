# SEC-006 — SQL injection via the `companyId` header and `Sequelize.literal()`

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 9.8 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`) |
| OWASP Top 10 2021 | A03:2021 – Injection |
| OWASP ASVS 4.0.3 | V5.3.4 – Parameterised queries or safe ORM usage; V5.3.5 – Context-aware escaping; V5.1.3 – All input validated |
| CWE | CWE-89 – Improper Neutralization of Special Elements used in an SQL Command |
| Status | Open |
| Affected component | `services/chatService.js`, `services/patientService.js`, `services/appointmentService.js`, `services/labTestService.js`, `services/PreEmployeePatientService.js`, `services/patientAssessmentService.js`, `services/carePlanService.js` |

## Summary

Eighteen SQL statements build attacker-controllable values into query text by string interpolation instead of binding them as parameters. Three distinct root causes account for all of them:

1. A **client-supplied `companyId` HTTP header** interpolated into `IN (...)` clauses in eleven raw queries.
2. **`Sequelize.literal()`** — raw SQL by definition, with no escaping — given request data directly.
3. **`Array.join(',')`** of request-supplied ids concatenated into an `IN (...)` clause.

The most severe instances are reachable **without authentication**, because the chat routes carry no auth middleware ([SEC-008](SEC-008-unauthenticated-sensitive-routes.md)) and the payload-encryption layer that nominally protects them is defeated by [SEC-004](SEC-004-hardcoded-aes-key-static-iv.md) and [SEC-005](SEC-005-public-crypto-oracle-endpoints.md).

Because the database account is `root` with an empty password ([SEC-030](SEC-030-database-root-empty-password.md)), successful injection yields full MySQL administrative control, not merely read access to the application's schema.

**Context:** the majority of raw queries in this codebase *do* use named `replacements` correctly — `patientFolderService.js`, `dataController.js`, `notificationService.js`, `assessmentService.js`, `migrationService.js` and others are clean. The problem is not a missing convention; it is eighteen places where the convention was not followed.

## Affected code

### Root cause 1 — the `companyId` header interpolated into `IN (...)`

The value originates as a raw HTTP header, is never validated, and is passed through to SQL:

`controllers/chatController.js:20-30`:
```js
async chat(req, res) {
    const { type, search } = req.query;
    const careCompanyIds = req.header('companyId') || null;     // :22  raw header
    ...
    list = await ChatService.chat(type, search, careCompanyIds);
```

`services/chatService.js:24-51`:
```js
static async chat(type, search, careCompanyIds) {
    if (type == 1) {
        let query = `
            SELECT p.id AS chatPartnerId, 1 AS chatPartnerType,
                   CONCAT(p.first_name, ' ', p.last_name) AS chatPartnerName,
                   pd.profile_image AS profilePic
            FROM patient p
            LEFT JOIN patientDetails pd ON p.id = pd.patientId
            WHERE (p.first_name LIKE :search OR p.last_name LIKE :search)
              AND p.employer_id IN (${careCompanyIds})          // :39  INJECTED
        `;
        const replacements = {};
        if (search) { replacements.search = `%${search}%`; }
        list = await sequelizeDB1.query(query, { type: QueryTypes.SELECT, replacements });
    }
```

The `search` parameter directly above is bound correctly with `:search`. The header on the very next line is not — which is what makes this a review oversight rather than an unknown pattern.

Route: `routes/chatRoutes.js:13` — `router.get('/searchList', validateDataEncryption(), ChatController.chat);` — **no `jwtAuth`**.

The same header reaches ten further sinks:

| File:line | Interpolation | Entry point |
|---|---|---|
| `services/patientService.js:985` | `AND p.employer_id IN (${careCompanyIds})` | `careNavigatorController.js:212` `getAllPatients` |
| `services/patientService.js:1045` | `AND p.employer_id IN (${careCompanyIds})` | `careNavigatorController.js:223` `getMyPatients` |
| `services/patientService.js:1094` | `AND p.employer_id IN (${careCompanyIds})` | `careNavigatorController.js:270` — **no `replacements` object at all** |
| `services/patientService.js:1117` | `AND p.employer_id IN (${careCompanyIds})` | `careNavigatorController.js:271` — **no `replacements` object at all** |
| `services/appointmentService.js:134` | `AND p.employer_id IN (${careCompanyIds})` | `careNavigatorController.js:53` |
| `services/appointmentService.js:195` | `AND p.employer_id IN (${careCompanyIds})` | `careNavigatorController.js:249` dashboard |
| `services/labTestService.js:2053` | `AND (p.companyId IN (${careCompanyIds}) OR p.employer_id IN (${careCompanyIds}))` | `careNavigatorController.js:239` |
| `services/labTestService.js:2139` | `AND p.employer_id IN (${careCompanyIds})` | `careNavigatorController.js:269` |
| `services/labTestService.js:2447` | `AND p.employer_id IN (${careCompanyIds})` | `careNavigatorController.js:294` |
| `services/PreEmployeePatientService.js:1194` | `pe.companyId IN (${careCompanyIds})` | `careNavigatorController.js:462` |

`index.js:52` explicitly permits the header through CORS: `allowedHeaders: ['Content-Type', 'Authorization','role','companyId']`.

### Root cause 2 — `Sequelize.literal()` with request data

`services/chatService.js:276-278`:
```js
attributes: [
    [sequelizeDB1.literal(`IF(senderId = ${userId} AND senderType = ${userType}, receiverId, senderId)`),   'chatPartnerId'],
    [sequelizeDB1.literal(`IF(senderId = ${userId} AND senderType = ${userType}, receiverType, senderType)`), 'chatPartnerType'],
    [sequelizeDB1.literal(`SUM(IF(isRead = 0 AND receiverId = ${userId} AND receiverType = ${userType}, 1, 0))`), 'unreadMessages'],
],
```

`literal()` instructs Sequelize to emit the string verbatim — it is an explicit escape hatch from the ORM's escaping. Two reachable sources, **neither authenticated**:

- **HTTP:** `controllers/chatController.js:90` — `const { userId, userType, search } = req.query;` → `routes/chatRoutes.js:11` (`/chat-list`, no `jwtAuth`).
- **Socket.IO:** `index.js:206-213` — `socket.on('getChatList', ({ userId, userType }) => ChatService.getChatList(userId, userType))`. The socket server has no handshake authentication at all ([SEC-007](SEC-007-socketio-no-authentication.md)) and bypasses `validateDataEncryption` entirely, so this path takes **plaintext** attacker input straight into raw SQL. `index.js:147-148` and `index.js:251` reach the same sink.

This is injection in the SELECT list, which is the most convenient position for an attacker: `1,(SELECT password FROM patient WHERE id=1),1` exfiltrates data with no UNION arity matching required.

### Root cause 3 — `Array.join(',')` into `IN (...)`

`services/patientAssessmentService.js:186-201`:
```js
const assessmentOptionIds = assessmentData.map(data => data.assessmentOptionId);
const idsString = assessmentOptionIds.join(',');
const query = `SELECT optionsValue FROM assessmentOptions WHERE id IN (${idsString})`;
const result = await sequelizeDB1.query(query, { type: ..., raw: true });    // no replacements
```

`assessmentData` comes from `req.body` (`controllers/patientAssessmentController.js:24-71`), via `POST /api/assessments/createBulk` (`routes/assessmentRoutes.js:16`) and `POST /api/patient_assessments/bulk` (`routes/patientAssessmentRoutes.js:11`). Neither route applies a Joi schema ([SEC-027](SEC-027-broken-and-missing-validation.md)), so `assessmentOptionId` may be any string.

`services/carePlanService.js:104-115` follows the same pattern with `carePlanIds.join(',')`. Its input is currently DB-sourced rather than request-sourced, making it **second-order**: it becomes live as soon as a non-numeric value lands in `carePlanId`, which the mass-assignment defects in [SEC-013](SEC-013-mass-assignment.md) permit.

## Technical detail

String interpolation into SQL removes the boundary between code and data. `replacements`/bind parameters preserve it: the value is sent to the server separately from the statement and can never alter its structure.

The `IN (...)` position is unusually permissive because a comma-separated list is expected, so an attacker does not even need to break out of a quoted string — there are no quotes to break out of. `1) OR 1=1 -- ` and `1) UNION SELECT ...` both work directly.

Two of the eleven header sinks (`patientService.js:1094`, `:1117`) pass **no `replacements` object at all**, meaning the header is the only variable in the statement — there is no other bound parameter to suggest the author considered binding.

The `Sequelize.literal()` case deserves separate emphasis: developers often assume that using the ORM implies safety. `literal()` is the one API that explicitly opts out. Any occurrence of `literal()` containing a `${...}` should be treated as a defect by default.

**Why `companyId` is doubly wrong:** even sanitised, this header must not determine data scope. It is the application's only tenancy boundary and it is supplied by the client — see [SEC-009](SEC-009-tenant-isolation-via-client-header.md). The correct fix removes the header entirely rather than escaping it, which resolves eleven of the eighteen sinks at a stroke.

## Exploit scenario

**Unauthenticated data exfiltration via the chat search**

1. Attacker calls the unauthenticated `GET /api/chat/searchList?type=1&search=a` (payload encryption is not an obstacle — see SEC-005), with the header:
   ```
   companyId: 1) UNION SELECT id, 1, email, password FROM patient -- 
   ```
2. The query becomes:
   ```sql
   ... WHERE (p.first_name LIKE '%a%' OR p.last_name LIKE '%a%')
       AND p.employer_id IN (1) UNION SELECT id, 1, email, password FROM patient -- )
   ```
3. The response returns every patient's email and MD5 password digest in the `chatPartnerName` / `profilePic` fields.
4. Attacker cracks the digests offline in minutes ([SEC-003](SEC-003-unsalted-md5-passwords.md)) and logs in normally as any user.

**Escalation to host compromise**

5. Because the DB user is `root` with an empty password ([SEC-030](SEC-030-database-root-empty-password.md)), the attacker additionally has `FILE` privilege: `SELECT ... INTO OUTFILE` to write to the filesystem, and `LOAD_FILE()` to read `/etc/passwd`, application source, and — critically — `.env`, which yields `JWT_SECRET` and every third-party API key ([SEC-032](SEC-032-secret-sprawl-working-tree.md)).

**Socket.IO variant (no encryption layer at all)**

6. Connect a raw Socket.IO client to the server (no authentication required) and emit:
   ```js
   socket.emit('getChatList', { userId: '1 AND (SELECT SLEEP(5))', userType: 1 });
   ```
   The value reaches `sequelizeDB1.literal()` in plaintext. Time-based blind extraction follows.

## Impact

- **Confidentiality:** complete read access to the PHI database — patients, clinical details, prescriptions, lab orders, chat transcripts, credentials — for an **unauthenticated** attacker.
- **Integrity:** with stacked or `UNION`-based writes and `root` privileges, arbitrary modification of clinical records.
- **Availability:** `SLEEP()`, heavy cartesian joins, or `DROP` under `root` privileges.
- **Lateral movement:** `LOAD_FILE()` on `.env` yields `JWT_SECRET`, SendGrid, Razorpay, OpenTok, SMS and lab-integration credentials, extending compromise to third-party services.
- **Regulatory:** mass unauthorised acquisition of PHI. This is the single finding most likely to constitute a reportable breach if exploited.

## Remediation

**Step 1 — eliminate the header sinks by removing the header (fixes 11 of 18).**

Derive tenant scope from the authenticated token, never the request. Add `companyId` to the JWT claims at sign time, read it from `req.user`, and bind it as an array parameter:

```js
// services/chatService.js
static async chat(type, search, companyIds) {
    // companyIds arrives from req.user.companyIds — server-derived, already an array of integers
    const query = `
        SELECT p.id AS chatPartnerId, 1 AS chatPartnerType,
               CONCAT(p.first_name, ' ', p.last_name) AS chatPartnerName,
               pd.profile_image AS profilePic
        FROM patient p
        LEFT JOIN patientDetails pd ON p.id = pd.patientId
        WHERE (p.first_name LIKE :search OR p.last_name LIKE :search)
          AND p.employer_id IN (:companyIds)      -- bound: Sequelize expands an array safely
    `;
    return sequelizeDB1.query(query, {
        type: QueryTypes.SELECT,
        replacements: { search: `%${search ?? ''}%`, companyIds },
    });
}
```

Sequelize expands an array bound to `:companyIds` into a correctly escaped list. Apply the identical change to all ten remaining header sinks. Remove `'companyId'` from `allowedHeaders` in `index.js:52` and delete every `req.header('companyId')` call site — see [SEC-009](SEC-009-tenant-isolation-via-client-header.md).

**Step 2 — remove `Sequelize.literal()` with request data.**

Either bind the values, or restructure the query. Binding inside `literal` is supported:

```js
const { literal } = require('sequelize');
const uid  = Number(userId);
const utyp = Number(userType);
if (!Number.isInteger(uid) || !Number.isInteger(utyp)) throw new Error('Invalid identifiers');

attributes: [
    [literal(`IF(senderId = ${uid} AND senderType = ${utyp}, receiverId, senderId)`), 'chatPartnerId'],
    // ...
]
```

Validating to an integer before interpolation is acceptable here because `Number.isInteger` admits nothing injectable. Prefer, where practical, computing `chatPartnerId` in application code after the fetch and removing `literal()` altogether. **Do not** rely on the caller having validated — validate at the sink.

**Step 3 — fix the `join(',')` sinks.**

```js
// services/patientAssessmentService.js
const ids = assessmentData
    .map(d => Number(d.assessmentOptionId))
    .filter(Number.isInteger);
if (ids.length === 0) return [];

const result = await sequelizeDB1.query(
    `SELECT optionsValue FROM assessmentOptions WHERE id IN (:ids)`,
    { type: QueryTypes.SELECT, replacements: { ids } }
);
```

Apply the same to `services/carePlanService.js:104-115`.

**Step 4 — defence in depth.**

- Add Joi schemas to the bulk assessment routes (see [SEC-027](SEC-027-broken-and-missing-validation.md)).
- Create a least-privilege MySQL user — `SELECT, INSERT, UPDATE, DELETE` on the application schema only, no `FILE`, no `SUPER` ([SEC-030](SEC-030-database-root-empty-password.md)). This converts a full host compromise into a data-layer incident.
- Add a lint rule or CI grep that fails the build on `sequelize.query(` containing a template literal with `${`, and on `literal(` containing `${`.
- Apply the same fixes to the stale duplicates `services/labTestService.js_555` and `services/dataService.js_222`, or delete them ([SEC-033](SEC-033-stale-duplicate-sources.md)).

## Verification

1. **Per-sink test:** for each of the eighteen locations, send a payload containing `'` and `)` and confirm the request fails validation or returns an empty result — never a SQL error and never extra rows.
2. **Union test:** `companyId: 1) UNION SELECT 1,2,3,4 -- ` against `/api/chat/searchList` must return 400/403, not 200 with four columns.
3. **Time-based test:** `userId: 1 AND (SELECT SLEEP(5))` on `/api/chat/chat-list` and on the Socket.IO `getChatList` event must not delay the response by 5 seconds.
4. **Static check:** `grep -rnE "query\(\s*\`[^\`]*\\\$\{" services/ controllers/` returns no results. `grep -rn "literal(\`" services/ | grep '\${'` returns only integer-validated occurrences.
5. **Header removal:** `grep -rn "req.header('companyId')" --include=*.js . | grep -v node_modules` returns nothing.
6. **Privilege check:** `SHOW GRANTS FOR CURRENT_USER;` from the application's connection shows no `FILE` and no `ALL PRIVILEGES ON *.*`.

## References

- OWASP Top 10 2021 — [A03:2021 Injection](https://owasp.org/Top10/A03_2021-Injection/)
- OWASP — [SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- Sequelize — [Raw queries and replacements](https://sequelize.org/docs/v6/core-concepts/raw-queries/)
- OWASP ASVS 4.0.3 — V5.3 Output Encoding and Injection Prevention
- CWE-89 — [SQL Injection](https://cwe.mitre.org/data/definitions/89.html)
