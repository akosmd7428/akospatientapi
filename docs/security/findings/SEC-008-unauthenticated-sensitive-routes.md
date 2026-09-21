# SEC-008 — Sensitive REST endpoints exposed without authentication

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 9.1 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A01:2021 – Broken Access Control |
| OWASP ASVS 4.0.3 | V4.1.1 – Enforce access controls on a trusted service layer; V1.4.4 – Single vetted access-control mechanism; V13.2.1 – Authorisation on API methods |
| CWE | CWE-306 – Missing Authentication for Critical Function; CWE-862 – Missing Authorization |
| Status | Open |
| Affected component | `routes/chatRoutes.js`, `routes/prescriptionRoutes.js`, `routes/opentokRoutes.js`, `routes/labTestRoutes.js`, `routes/patientProfileRoutes.js`, `routes/authRoutes.js` |

## Summary

A substantial set of PHI-bearing endpoints carries no authentication middleware. All eight chat endpoints, prescription read and write, OpenTok video-session token minting, several lab-order routes and a patient lookup endpoint are reachable by anonymous callers.

The apparent reason is that these routes carry `validateDataEncryption()` and the payload-encryption layer was treated as an access control. It is not one: the key is hardcoded and committed ([SEC-004](SEC-004-hardcoded-aes-key-static-iv.md)), and the server will encrypt arbitrary payloads on request ([SEC-005](SEC-005-public-crypto-oracle-endpoints.md)). Every one of these endpoints is therefore reachable by an outsider.

One endpoint deserves particular attention: `GET /api/prescription` returns a patient's full demographic and clinical record keyed on a `token` query parameter that is simply **the patient's email address**.

## Affected code

### Chat — all eight endpoints unauthenticated

`routes/chatRoutes.js:6-13` — no auth middleware appears anywhere in the file:

```js
router.post('/initiate-chat',      validateDataEncryption(), ChatController.initiateChat);
router.post('/send-message',       validateDataEncryption(), ChatController.sendMessage);
router.get ('/chat-history',       validateDataEncryption(), ChatController.getChatHistory);
router.get ('/user-status',        validateDataEncryption(), ChatController.getUserStatus);
router.post('/update-user-status', validateDataEncryption(), ChatController.updateUserStatus);
router.get ('/chat-list',          validateDataEncryption(), ChatController.getChatList);
router.post('/update-read-status', validateDataEncryption(), ChatController.updateReadStatus);
router.get ('/searchList',         validateDataEncryption(), ChatController.chat);
```

The handlers take `senderId`/`receiverId` from the request (`controllers/chatController.js:42,54,66,90,102`), so the caller selects whose conversation to read or write. `/searchList` and `/chat-list` are also the SQL injection sinks of [SEC-006](SEC-006-sql-injection.md).

### Prescriptions — read and write unauthenticated

`routes/prescriptionRoutes.js:7,9,10`:

```js
router.post('/prescription/detail', validateDataEncryption(), PatientController.savePrescriptionDetails);   // :7
router.get ('/prescription',                                  PatientController.getPrescription);           // :9
router.get ('/medicines',                                     PatientController.getMedicines);              // :10
```

`controllers/patientController.js:284-376` — the read path. The "token" is the email:

```js
const secretKey = "8D3f…";                                    // :286  hardcoded XOR key
// ... the XOR decode that this key guarded is commented out at :302-306 and :325-330
const patient = await Patient.findOne({ where: { email: token } });   // :308  token IS the email
```

Because the decoding step is commented out, `?token=victim@company.com` is accepted verbatim. The response includes name, date of birth, phone, email, UUID, height, weight and blood group.

`POST /prescription/detail` is the write path, and is also the entry point for the Puppeteer HTML injection in [SEC-015](SEC-015-html-injection-puppeteer-pdf.md) and the mass assignment in [SEC-013](SEC-013-mass-assignment.md).

### OpenTok — anyone can mint a video session token

`routes/opentokRoutes.js:5-6`:

```js
router.get('/generate-session', OpentokController.generateSession);
router.get('/generate-token',   OpentokController.generateToken);
```

`controllers/opentokController.js:15-25` mints a token for any supplied `sessionId`. An attacker who learns or guesses a session id can join a live teleconsultation between a patient and clinician.

### Lab orders and third-party lab integration

`routes/labTestRoutes.js:25,26,37,43-47`:

```js
router.put('/order',                LabTestController.updateLabOrder);              // :25  mutate any order
router.get('/list/:patientId',      LabTestController.getLabOrdersByPatientId);     // :26  any patient's orders
router.post('/paymentStatusMobile', ...);                                           // :37
router.get ('/getRedcliffAloc',     ...);   router.post('/getRedcliffSlot',      ...);   // :43-44
router.post('/createRedcliffBooking', ...); router.post('/redCliffReport',       ...);   // :45-46
router.post('/fetchRedcliffReport', ...);                                               // :47
```

### Patient lookup by email

`routes/patientProfileRoutes.js:12`:

```js
router.get('/details/:patientEmail', validateDataEncryption(), PatientController.getPatientDetailsByEmail);
```

`controllers/patientController.js:235-237` returns distinct messages for "care navigator", "patient" and "no user", making it an account-type oracle — see [SEC-028](SEC-028-account-enumeration.md).

### Auth routes without even the encryption layer

`routes/authRoutes.js:14,15` — `/ssologin` and `/sso-client-login` carry neither `jwtAuth` nor `validateDataEncryption()`, so `client_secret` traverses them in plaintext and is persisted by the route logger ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).

### The counter-example

`routes/migrationRoutes.js:6-9` is the one router that gets this right — all four routes carry `syncApiKeyAuth`, which performs a constant-time comparison and fails closed when the key is unset (`middleware/syncApiKeyAuth.js:7-23`). The pattern exists in the codebase; it simply was not applied here.

## Technical detail

The consistent presence of `validateDataEncryption()` on these routes, and the consistent absence of `jwtAuth`, indicates a design assumption that an encrypted payload implies a legitimate caller. That assumption fails for three independent reasons:

1. The key is a literal in a git-tracked file and is also present in any shipped frontend bundle.
2. `POST /api/auth/encrypt` produces valid ciphertext for arbitrary input, without authentication.
3. Encryption is not identification. Even a secret key would only prove the caller possessed the key — which every client does — not *who* the caller is.

The inconsistency within individual routers is telling: `routes/labTestRoutes.js` applies `jwtAuth` to some routes and not to adjacent ones; `routes/forgotPasswordRoutes.js` registers the same handler twice, once with `jwtAuth` and once without. This is drift, not design — which means the correct fix is a default-deny mount rather than case-by-case patching.

## Exploit scenario

**Harvesting a patient record with a single GET**

1. Attacker obtains or guesses a registered email address.
2. `GET /api/prescription?token=victim@company.com`
3. Response contains the patient's name, date of birth, phone, email, UUID, height, weight and blood group. No authentication, no encryption to defeat — this route does not even carry `validateDataEncryption()`.

**Reading a conversation**

4. `GET /api/chat/chat-history` with `senderId`/`receiverId` chosen by the attacker returns the clinician–patient transcript. Payload encryption is produced via the SEC-005 oracle.

**Joining a live consultation**

5. `GET /api/opentok/generate-token?sessionId=<id>` returns a valid Vonage token. The attacker joins the video call.

**Financial and clinical tampering**

6. `PUT /api/labs/order` modifies any lab order; `POST /api/prescription/detail` writes a prescription into any patient's record and triggers PDF generation and email delivery to the patient ([SEC-015](SEC-015-html-injection-puppeteer-pdf.md)).

## Impact

- **Confidentiality:** anonymous read of chat transcripts, prescriptions, lab orders and patient demographics.
- **Integrity:** anonymous write of chat messages, prescriptions and lab orders. A forged prescription delivered by email to a patient is a direct patient-safety risk, not only a data risk.
- **Availability:** unauthenticated write endpoints permit data flooding.
- **Regulatory:** PHI disclosure to unauthenticated parties. HIPAA §164.312(a)(1) access control and §164.312(d) entity authentication are unmet across a large share of the API surface.

## Remediation

**Step 1 — invert the default. Deny first, then allow explicitly.**

Rather than adding `jwtAuth` route by route (which is how the current drift arose), mount authentication at the router level and carve out the small set of genuinely public endpoints:

```js
// index.js
const { requireAuth, ROLES } = require('./middleware/requireAuth');   // see SEC-001

// The complete set of endpoints that may be reached anonymously.
const PUBLIC_PREFIXES = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/external-signup',
    '/api/auth/verify-email-token',
    '/api/forgot-password/send-otp',
    '/api/forgot-password/verify-otp',
    '/api/forgot-password/change-password',   // guarded by a reset token instead — see SEC-002
    '/api/data/states',
    '/api/data/cities',
];

app.use('/api', (req, res, next) => {
    if (PUBLIC_PREFIXES.some(p => req.path.startsWith(p.replace('/api', '')))) return next();
    return requireAuth(ROLES.PATIENT, ROLES.HR, ROLES.CARE_NAVIGATOR)(req, res, next);
});
```

Per-route `requireAuth(<specific role>)` calls then narrow further where a route is role-specific. A new route added without thought is protected by default.

**Step 2 — fix the prescription lookup.** `GET /api/prescription` must take the patient from `req.user.id`, not from a query parameter, and must never accept an email as a bearer credential:

```js
static async getPrescription(req, res) {
    const patientId = req.user.id;          // from the verified token only
    const prescription = await PatientService.getPrescriptionForPatient(patientId);
    ...
}
```
Delete the hardcoded `secretKey` at `controllers/patientController.js:286` and the commented-out XOR blocks at `:302-306` and `:325-330` — see [SEC-011](SEC-011-bola-idor-across-endpoints.md).

**Step 3 — OpenTok.** Require authentication, and verify that the caller is a participant in the appointment that owns the session before minting a token. Sessions must be bound to an appointment record, not requested by id.

**Step 4 — third-party lab callbacks.** `redCliffReport` and `fetchRedcliffReport` may be provider callbacks that cannot carry a user token. Authenticate them with a shared secret and signature verification, using `middleware/syncApiKeyAuth.js` as the model — not by leaving them open.

**Step 5 — add a route-inventory test** that enumerates the mounted routes at boot and fails CI if any route outside `PUBLIC_PREFIXES` lacks an auth middleware. This prevents recurrence, which matters more here than any individual fix.

## Verification

1. **Anonymous sweep:** call every endpoint in *Affected code* with no `Authorization` header. All must return 401. Before the fix, all return 200.
2. **Prescription test:** `GET /api/prescription?token=<any email>` must return 401 regardless of the email.
3. **Inventory test:** the CI route-inventory check passes, and deliberately adding an unguarded test route makes it fail.
4. **Cross-user test:** authenticated as patient A, confirm chat and prescription endpoints return only A's data.
5. **Regression:** the legitimate frontend continues to work — this change will surface any client call that was relying on anonymous access, which should be treated as a finding in its own right.

## References

- OWASP Top 10 2021 — [A01:2021 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- OWASP API Security Top 10 2023 — API2:2023 Broken Authentication; API5:2023 Broken Function Level Authorization
- OWASP ASVS 4.0.3 — V4.1 General Access Control Design
- CWE-306 — [Missing Authentication for Critical Function](https://cwe.mitre.org/data/definitions/306.html)
