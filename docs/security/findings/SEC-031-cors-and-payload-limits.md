# SEC-031 — Localhost origins allow-listed in production; 50 MB bodies logged synchronously

| Field | Value |
|---|---|
| Severity | **Medium** |
| CVSS v3.1 | 5.9 (`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:H`) |
| OWASP Top 10 2021 | A05:2021 – Security Misconfiguration |
| OWASP ASVS 4.0.3 | V14.5.3 – CORS `Access-Control-Allow-Origin` header uses a trusted allow-list; V13.4.1 – Protection against resource exhaustion; V12.1.1 – Upload size limits |
| CWE | CWE-942 – Permissive Cross-domain Policy; CWE-400 – Uncontrolled Resource Consumption |
| Status | Open |
| Affected component | `index.js` |

## Summary

Two configuration issues in the application bootstrap.

**CORS.** The origin allow-list is explicit and does not use a wildcard — which is correct — but it includes **six `http://localhost` origins** in what is the production configuration. A commented-out `origin: "*"` sits one line above, a single edit from disabling the control entirely.

**Payload size.** `express.json({ limit: '50mb' })` accepts 50 MB request bodies on every endpoint. The globally mounted `routeLogger` then performs a synchronous `JSON.stringify` of that body and writes it to the database on **every request**. A handful of concurrent large requests will exhaust memory and block the event loop.

A duplicate `express.json()` at `index.js:70` is dead code that makes the effective limit non-obvious to a reader.

## Affected code

`index.js:47-53`:

```js
const corsOptions = {
  // origin: "*",                                                    // :49  one edit away
  origin: ["https://carenavigator.akosmd.in", "https://360.akosmd.in",
           "http://localhost:3000","http://localhost:3001","http://localhost:3002",
           "http://localhost:3003","http://localhost:3004","http://localhost:3005"],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization','role','companyId'],   // :52  see SEC-001, SEC-009
};
```

`credentials: true` is **not** set, which limits CSRF exposure — the browser will not attach cookies cross-origin. Tokens are Bearer, so they are not sent automatically either.

`index.js:44-45, 70-72`:

```js
app.use(express.json({ limit: '50mb' }));                      // :44
app.use(express.urlencoded({ limit: '50mb', extended: true })); // :45
...
app.use(express.json());                                        // :70  dead — the 50 MB above wins
app.use(routeLogger);                                           // :72  logs every body
```

`middleware/routeLogger.js:25`:

```js
LogService.logError(userId, null, routeName, functionName, "API HIT", JSON.stringify(req.body), role);
```

The stale `index.js.save:36` shows a previous iteration of the policy that included an empty-string origin.

## Technical detail

**Localhost in a production allow-list.** This does not let a random website call the API — a malicious page at `evil.example` still fails the origin check. The exposure is narrower but real:

- Any application running on a clinician's machine at `localhost:3000`–`3005` can call the production PHI API with the browser's cooperation. That includes a developer tool, a locally installed application, or a compromised local process.
- It signals that development and production share one configuration, which is how `origin: "*"` ends up uncommented during a debugging session.

The correct approach is environment-specific configuration, so production simply has no localhost entries.

**The header allow-list is the more serious part of this configuration** — `role` and `companyId` are the authorization-bypass vectors in [SEC-001](SEC-001-broken-role-enforcement.md) and [SEC-009](SEC-009-tenant-isolation-via-client-header.md). They are documented there; they should be removed here.

**50 MB bodies plus synchronous logging.** The combination is what makes this an availability issue rather than a configuration nit:

1. Express buffers the entire body in memory before any handler runs.
2. `JSON.stringify` on a 50 MB object is synchronous and **blocks the event loop** — Node is single-threaded, so nothing else is served for the duration.
3. The serialised result is written to MySQL, consuming connection-pool capacity and disk.

Twenty concurrent 50 MB requests is a gigabyte of resident memory plus twenty blocking serialisations. No authentication is required to attempt this on the unauthenticated routes ([SEC-008](SEC-008-unauthenticated-sensitive-routes.md)).

The 50 MB limit presumably exists to accommodate base64 document uploads ([SEC-014](SEC-014-unrestricted-file-upload.md)). That is a reason to raise the limit **on the upload route**, not globally.

**The duplicate `express.json()`** at `:70` is harmless — the first registration wins — but it makes the actual limit ambiguous to anyone reading the file, which is its own small risk.

## Exploit scenario

**Denial of service**

1. Attacker sends twenty concurrent `POST /api/chat/send-message` requests (unauthenticated) with 50 MB JSON bodies.
2. Express buffers all of them — roughly 1 GB resident.
3. `routeLogger` calls `JSON.stringify` on each, blocking the event loop in turn. The API stops responding to all users.
4. Each serialised body is written to MySQL, filling the connection pool and consuming disk.
5. Repeating in a loop keeps the service down at negligible cost to the attacker.

**Localhost origin abuse**

6. A clinician has a compromised or malicious application listening on `localhost:3000`, or visits a page that a local development server serves.
7. That origin is allow-listed, so the browser permits cross-origin requests to the production API. Combined with a token in browser storage, the local application reads PHI.

## Impact

- **Availability:** unauthenticated, low-cost denial of service. This is the primary impact and the reason for the `A:H` vector component.
- **Confidentiality:** narrow — a local application on a clinician's machine can reach the production API.
- **Storage:** unbounded `logs` growth accelerated by large bodies ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).
- **Configuration risk:** a commented-out wildcard is an invitation.

## Remediation

**Step 1 — environment-specific CORS, and drop the dangerous headers.**

```js
// config/cors.js
const PROD_ORIGINS = ['https://carenavigator.akosmd.in', 'https://360.akosmd.in'];
const DEV_ORIGINS  = Array.from({ length: 6 }, (_, i) => `http://localhost:${3000 + i}`);

const allowed = process.env.NODE_ENV === 'production'
    ? PROD_ORIGINS
    : [...PROD_ORIGINS, ...DEV_ORIGINS];

module.exports = {
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);          // same-origin / server-to-server
        return allowed.includes(origin) ? cb(null, true) : cb(new Error('Origin not allowed'));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],   // 'role' and 'companyId' removed
    maxAge: 600,
};
```

Delete the commented `origin: "*"` line — a commented-out insecure default is a latent defect, not documentation.

**Step 2 — right-size the body limit per route.**

```js
app.use(express.json({ limit: '256kb' }));                       // global default
app.use(express.urlencoded({ limit: '256kb', extended: true }));

// Only where large payloads are legitimately required:
app.post('/api/data/upload',
    requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR),
    express.json({ limit: '15mb' }),                             // 10 MB file + base64 overhead
    DataController.upload
);
```

Remove the duplicate `express.json()` at `:70`.

**Step 3 — prefer multipart for file uploads.** Base64 in JSON inflates payloads by a third and forces full in-memory buffering. `multer` with `diskStorage` streams to disk with a hard size limit and never holds the whole file in memory:

```js
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
```

**Step 4 — stop logging request bodies** ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)). This removes the synchronous `JSON.stringify` from the hot path entirely and is the single highest-value change for this finding.

**Step 5 — add operational limits:** a request timeout (`httpServer.requestTimeout = 30_000`), per-user upload quotas, and a body-size-aware rate limiter that counts bytes rather than requests.

## Verification

1. **CORS production:** with `NODE_ENV=production`, a preflight from `http://localhost:3000` is rejected; one from `https://360.akosmd.in` succeeds.
2. **Headers:** confirm the `Access-Control-Allow-Headers` response no longer lists `role` or `companyId`.
3. **Body limit:** a 1 MB body to a normal endpoint returns 413; a 5 MB upload to the upload route succeeds.
4. **Event loop:** send ten concurrent large uploads and confirm unrelated endpoints continue responding within normal latency.
5. **Memory:** monitor RSS under that load and confirm it does not scale linearly with request size.
6. **No wildcard:** `grep -n 'origin: "\*"' index.js config/` returns nothing, commented or otherwise.
7. **Timeout:** a stalled request is closed after 30 seconds.

## References

- OWASP — [HTML5 Security Cheat Sheet: CORS](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#cross-origin-resource-sharing)
- OWASP — [Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V14.5 Validate HTTP Request Header Requirements
- CWE-942 — [Permissive Cross-domain Policy with Untrusted Domains](https://cwe.mitre.org/data/definitions/942.html)
