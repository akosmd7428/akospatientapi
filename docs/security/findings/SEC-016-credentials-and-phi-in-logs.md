# SEC-016 — Credentials and PHI written to stdout and persisted to the database

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`) |
| OWASP Top 10 2021 | A09:2021 – Security Logging and Monitoring Failures; A02:2021 – Cryptographic Failures |
| OWASP ASVS 4.0.3 | V7.1.1 – No credentials or payment details in logs; V7.1.2 – No sensitive data in logs; V8.3.4 – Sensitive data inventory and retention |
| CWE | CWE-532 – Insertion of Sensitive Information into Log File; CWE-312 – Cleartext Storage of Sensitive Information |
| Status | Open |
| Affected component | `middleware/routeLogger.js`, `middleware/errorHandler.js`, `helpers/logErrorHelper.js`, `models/logsModel.js`, `controllers/authController.js`, `helpers/commonHelper.js` |

## Summary

Two logging mechanisms record sensitive data.

First, `routeLogger` is mounted globally and writes **every request body verbatim** into a `logs` database table. The column is unencrypted, has no redaction, and has no retention policy. For endpoints that skip the payload-encryption middleware, this captures plaintext credentials — including the SSO `client_secret` — alongside PHI.

Second, `controllers/authController.js:32` calls `console.log(req.body)` inside the login handler, **after** the decryption middleware has replaced the body with plaintext. Every login attempt writes the user's email address and password in clear text to the process log.

There are 240 `console.log` calls outside `node_modules`; roughly fifteen print credentials, tokens or patient records.

## Affected code

### Every request body persisted to the database

`index.js:72` — mounted globally, before all routers:

```js
app.use(routeLogger);
```

`middleware/routeLogger.js:25`:

```js
LogService.logError(userId, null, routeName, functionName, "API HIT", JSON.stringify(req.body), role);
```

`helpers/logErrorHelper.js:5-13` → `Logs.create(...)`, and `models/logsModel.js:30-40`:

```js
additionalData: { type: DataTypes.JSON },     // :30  raw request body
...
{ tableName: 'logs', timestamps: false }      // :40  no createdAt — no retention possible
```

Because the middleware runs **before** the routers, it captures the body as received. On routes that do carry `validateDataEncryption()`, that is ciphertext — but on routes that do not, it is plaintext:

- `POST /api/auth/sso-client-login` (`routes/authRoutes.js:15`) — records `client_secret`.
- `POST /api/auth/ssologin` (`routes/authRoutes.js:14`).
- `POST /api/auth/decrypt` (`routes/authRoutes.js:12`).
- All four migration routes (`routes/migrationRoutes.js:6-9`) — bulk patient payloads.

`middleware/errorHandler.js:13,21,27` writes `req.body` into the same table on every error.

Note the ciphertext case is not protection either: the key is committed ([SEC-004](SEC-004-hardcoded-aes-key-static-iv.md)) and a public oracle decrypts it ([SEC-005](SEC-005-public-crypto-oracle-endpoints.md)). The `logs` table is effectively a plaintext archive of every request the platform has received.

### Plaintext password to stdout on every login

`controllers/authController.js:32`:

```js
console.log(req.body);
```

`routes/authRoutes.js:10` applies `validateDataEncryption()`, which **replaces** `req.body` with the decrypted object. By the time this line runs, `req.body` is `{ email, password }` in clear text.

### The worst remaining sites

| # | Location | What leaks |
|---|---|---|
| 1 | `controllers/authController.js:32` | login body — email + **plaintext password** |
| 2 | `controllers/authController.js:205` | `console.log(client_secret)` |
| 3 | `controllers/authController.js:236` | `console.log(company)` — full row incl. `client_secret`, `api_ip_whitelist` |
| 4 | `helpers/commonHelper.js:151` | `console.log(valueBuffer)` **inside `secureCompare`** — prints the secret being compared, on every SSO attempt |
| 5 | `services/smsService.js:10` | full SMS gateway response — OTP delivery status and phone numbers |
| 6 | `services/smsService.js:18` | axios error object — `config.url` embeds `apikey=<SMS_API_KEY>` |
| 7 | `controllers/hrController.js:29` | HR/employee PII record |
| 8 | `controllers/careNavigatorController.js:444`, `hrController.js:533` | full patient row — name, DOB, phone, email |
| 9 | `services/appointmentService.js:375,763` | patient object and full doctor-call list |
| 10 | `index.js:240,325` | teleconsultation call and participant details |

Item 4 is especially unfortunate: a helper written specifically to compare secrets safely logs the secret it was given.

## Technical detail

**The database table is the larger exposure.** Process logs are usually rotated and access-controlled; a table in the application's own MySQL instance is not. It means:

- The SQL injection in [SEC-006](SEC-006-sql-injection.md) yields not only the current data but a historical archive of every request body ever submitted.
- `timestamps: false` means there is no `createdAt` column, so no retention or purge policy can be implemented without a schema change. The table grows without bound.
- Credentials and PHI sit in the same database as the data they protect — one compromise yields both.

**Log records outlive their source.** Backups, replicas, monitoring pipelines, log aggregators and support exports all copy this data outward. A password logged once may persist in a dozen systems indefinitely.

**Auditability is confused with logging.** This system logs *everything* with no redaction, which is simultaneously too much (secrets and PHI) and too little (no structured record of security-relevant events — no authentication failures, no authorisation denials, and Socket.IO activity is not logged at all, per [SEC-007](SEC-007-socketio-no-authentication.md)). `morgan` is declared in `package.json:29` but never required anywhere, so there is no access log either.

**Performance.** A synchronous `JSON.stringify` of a body up to 50 MB plus a database insert on **every** request is also a throughput and availability concern ([SEC-031](SEC-031-cors-and-payload-limits.md)).

## Exploit scenario

**Via database access**

1. Attacker exploits [SEC-006](SEC-006-sql-injection.md) and runs `SELECT additionalData FROM logs WHERE additionalData LIKE '%client_secret%'`.
2. The result is the SSO client secrets of every integrating company, in plaintext.
3. `SELECT additionalData FROM logs` yields the historical PHI archive — every patient record ever submitted or returned through an unencrypted route.

**Via process logs**

4. Anyone with log access — an operations engineer, a support contractor, a log-aggregation vendor, or an attacker who has compromised the log pipeline — greps for `password` and obtains user credentials in clear text.
5. Because passwords are MD5-hashed at rest ([SEC-003](SEC-003-unsalted-md5-passwords.md)) but logged in plaintext here, **the logs are a weaker link than the database**.

**Via insider access**

6. No special privilege is needed: routine log review exposes credentials to staff who have no business seeing them, creating an insider risk and an access-control problem that is invisible to the application's own authorisation model.

## Impact

- **Confidentiality:** plaintext credentials (user passwords, SSO client secrets, SMS API key) and PHI in both process logs and a database table.
- **Compliance:** HIPAA §164.312(b) requires audit controls; §164.514 requires minimum necessary use. Logging complete request bodies containing PHI, with no retention limit, fails both. PCI-DSS 3.2 forbids storing authentication data in logs, which is relevant given the Razorpay integration.
- **Blast radius:** a single database or log-pipeline compromise yields credentials *and* data.
- **Availability:** synchronous serialisation and an insert per request.

## Remediation

**Step 1 — stop logging request bodies (do this first; it is a one-line change).**

```diff
--- a/middleware/routeLogger.js
-LogService.logError(userId, null, routeName, functionName, "API HIT", JSON.stringify(req.body), role);
+LogService.logAccess({ userId, role, route: routeName, method: req.method, status: res.statusCode });
```

**Step 2 — log an allow-list of fields, never a denylist.**

```js
// helpers/logRedaction.js
const SAFE_FIELDS = new Set(['page', 'limit', 'sortBy', 'status', 'type', 'timeFilter']);

function safeLogPayload(body) {
    if (!body || typeof body !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(body)) {
        if (SAFE_FIELDS.has(k)) out[k] = v;
        else out[k] = `[redacted:${typeof v}]`;      // record shape, never value
    }
    return out;
}
```

A denylist of `password`, `token`, `client_secret` will miss the next sensitive field added. Only an allow-list holds.

**Step 3 — remove the credential-printing `console.log` calls.** Delete items 1–10 above. Then replace ad-hoc logging wholesale with a structured logger (`pino` or `winston`) configured with redaction paths:

```js
const pino = require('pino');
const logger = pino({
    redact: {
        paths: ['req.body.password', 'req.body.client_secret', 'req.headers.authorization',
                'req.body.newPassword', 'req.body.otp', '*.password', '*.token'],
        censor: '[REDACTED]',
    },
    level: process.env.LOG_LEVEL || 'info',
});
```

Add a CI check that fails on new `console.log` in `controllers/`, `services/` and `middleware/`.

**Step 4 — separate audit logging from diagnostic logging.** Build a real audit trail recording *security events*, not payloads:

| Event | Fields |
|---|---|
| Authentication success/failure | userId, role, IP, user-agent, timestamp, outcome |
| Authorization denial | userId, attempted resource, outcome |
| PHI access | actorId, subjectPatientId, resource type, timestamp |
| Impersonation | actor, subject, reason ([SEC-012](SEC-012-patient-impersonation-endpoint.md)) |
| Password reset issued/consumed | userId, IP — never the token ([SEC-002](SEC-002-unauthenticated-password-reset.md)) |
| Admin/config change | actor, what changed |

This is what HIPAA §164.312(b) actually requires, and it is currently absent while the noise is overwhelming.

**Step 5 — fix the `logs` table.** Add `createdAt`, implement a retention policy (for example 90 days for diagnostics, 6 years for the audit trail per HIPAA §164.316(b)(2)), move it to a separate datastore with separate credentials, and restrict read access.

**Step 6 — purge existing data.** The current `logs` table contains historical credentials and PHI. Assess it, then purge or re-encrypt. Rotate every SSO `client_secret` that has been written to it — assume all of them.

## Verification

1. **Login test:** log in and inspect the process log. No `password` value may appear. Before the fix it appears in plaintext.
2. **Table test:** `SELECT additionalData FROM logs ORDER BY id DESC LIMIT 20;` shows only allow-listed fields and `[redacted:*]` markers.
3. **Grep test:** `grep -rn "console.log(" controllers/ services/ middleware/ helpers/ index.js | wc -l` trends to zero; CI enforces it.
4. **Secret scan:** run `gitleaks` against a log export — zero findings.
5. **Audit trail:** a failed login, an authorisation denial and a PHI read each produce exactly one structured audit record with the fields above.
6. **Retention:** confirm `createdAt` exists and the purge job removes records past the policy window.
7. **`secureCompare`:** confirm `helpers/commonHelper.js:151` no longer prints the compared value.

## References

- OWASP — [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V7 Error Handling and Logging Verification Requirements
- HIPAA Security Rule §164.312(b) — Audit Controls
- CWE-532 — [Insertion of Sensitive Information into Log File](https://cwe.mitre.org/data/definitions/532.html)
