# SEC-005 — Unauthenticated encryption and decryption oracle endpoints

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 9.1 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A01:2021 – Broken Access Control; A02:2021 – Cryptographic Failures |
| OWASP ASVS 4.0.3 | V1.4.4 – Single, vetted access-control mechanism; V6.2.1 – Cryptographic modules fail securely; V14.2.6 – No unnecessary features exposed |
| CWE | CWE-200 – Exposure of Sensitive Information; CWE-306 – Missing Authentication for Critical Function |
| Status | Open |
| Affected component | `routes/authRoutes.js`, `controllers/authController.js` |

## Summary

Three endpoints expose the application's payload cipher directly to anonymous callers. `POST /api/auth/decrypt` and `GET /api/auth/getquery` take arbitrary attacker-supplied ciphertext, decrypt it with the server's key, and return the **plaintext**. `POST /api/auth/encrypt` performs the reverse, encrypting arbitrary attacker-supplied data with the server's key.

None carries `jwtAuth`. None carries `validateSchema`. They appear to be developer conveniences — "sample" is in both function names — that were shipped to production.

Their effect is that the payload encryption layer offers no protection **even if its key were secret**. An attacker never needs the key: the server will encrypt and decrypt on demand. This is what makes the hardcoded key of [SEC-004](SEC-004-hardcoded-aes-key-static-iv.md) unrecoverable by rotation alone — a new key would be defeated the moment it was deployed, as long as these endpoints exist.

## Affected code

`routes/authRoutes.js:11-13` — no authentication middleware on any of the three:

```js
router.post('/encrypt',  AuthController.encryptDataSample);
router.post('/decrypt',  AuthController.decryptDataSample);
router.get ('/getquery', AuthController.getQueryStr);
```

Compare the lines above them, which do carry the encryption middleware and schema validation:

```js
router.post('/register', validateDataEncryption(), validateSchema(registerSchema), AuthController.register);
router.post('/login',    validateDataEncryption(), validateSchema(loginSchema),    AuthController.login);
```

`controllers/authController.js:96-109` — the decryption oracle:

```js
static async decryptDataSample(req, res, next) {
    try {
        const { encryptedData, IV } = req.body;
        let result = decryptData(encryptedData, IV);          // :101  attacker-supplied ciphertext
        result = JSON.parse(result);
        let msgg = 'Decrypt success';
        return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.msgg, { result });   // :104  plaintext returned
    } catch (error) {
        errorHandler(error, req, res, next);
        return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);              // :107  raw error, unencrypted
    }
}
```

`controllers/authController.js:111-134` — `getQueryStr` is a near-duplicate, reachable by **GET**, and additionally contains dead debug branches that log to stdout:

```js
if (Object.keys(req.params).length != 0) { console.log('The object is empty'); }   // :116  inverted message
else { console.log('The object is not empty'); }
...
const { encryptedData, IV } = req.body;
let result = decryptData(encryptedData, IV);      // :127
result = JSON.parse(result);
return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.msgg, { result });   // :130
```

`controllers/authController.js:80-94` — the encryption oracle. The body is passed straight to `sendEncryptData`, which encrypts it with the server key:

```js
static async encryptDataSample(req, res, next) {
    try {
        let data = req.body;
        let EntData = data;
        return CommonHelper.sendEncryptData(res, true, STATUS_CODE.HTTP_201_CREATED, messages.registrationSuccess, { EntData });   // :89
    } catch (error) { ... }
}
```

Note the return of `sendSuccessUnencrypt` / `sendErrorUnencrypt` on the decrypt paths — the responses deliberately bypass the response-encryption layer, so the plaintext is returned in the clear.

## Technical detail

A cryptographic oracle is an interface that performs a key-dependent operation on attacker-chosen input and returns the result. These three are textbook examples, with no rate limiting beyond the global 1000-per-15-minutes bucket ([SEC-021](SEC-021-insufficient-anti-automation.md)) and no authentication at all.

**The decryption oracle** lets an attacker read any ciphertext the platform has produced: captured request bodies, ciphertexts recovered from the `logs` table ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)), values from browser storage, or anything intercepted. They paste it in, the server decrypts it, and the plaintext comes back as JSON.

**The encryption oracle** lets an attacker mint valid ciphertext for any plaintext they choose, which is what turns every "encryption-protected" unauthenticated endpoint into an open one. The team's apparent reasoning — that requiring `encryptedData` makes an endpoint hard to call — collapses entirely: `POST /api/auth/encrypt` produces the required blob on request. This is the delivery path for [SEC-002](SEC-002-unauthenticated-password-reset.md) and [SEC-006](SEC-006-sql-injection.md).

**Secondary issues on the same endpoints:**

- `error.message` is returned unencrypted (`:107`, `:132`), so decryption failures leak `crypto` and `JSON.parse` internals — useful for distinguishing padding failures from parse failures, which is the discriminator a CBC padding-oracle attack needs ([SEC-029](SEC-029-decryption-middleware-defects.md)).
- `getQueryStr` reads `req.body` on a **GET** route. Express does parse a body on GET when one is sent, so it works — but it also means the oracle is reachable in contexts where only GET is permitted (some proxies, link prefetch, image tags).
- `errorHandler(error, req, res, next)` is called *and then* `sendErrorUnencrypt` is called — a double-response hazard, see [SEC-026](SEC-026-broken-error-handler.md).
- `JSON.parse` on decrypted attacker data creates a `__proto__` own property. Harmless today because nothing deep-merges the result, but it is one refactor away from prototype pollution.

## Exploit scenario

**Reading captured traffic**

1. Attacker obtains an encrypted body — from a proxy log, a shared network capture, a browser's network panel on a shared machine, or the application's own `logs` table.
2. ```
   POST /api/auth/decrypt
   { "encryptedData": "<captured hex>", "IV": "<captured iv>" }
   ```
3. Response: `{ "result": { "email": "victim@company.com", "password": "..." } }` — no authentication was required at any point.

**Forging a request to reach a protected-looking endpoint**

1. ```
   POST /api/auth/encrypt
   { "email": "victim@company.com", "newPassword": "Attacker#1" }
   ```
   Response contains `encryptedData` and `IV` produced with the server's own key.
2. Attacker replays that blob to `POST /api/forgot-password/change-password` ([SEC-002](SEC-002-unauthenticated-password-reset.md)) and takes over the account.
3. The same technique produces the SQL injection payloads for [SEC-006](SEC-006-sql-injection.md) and reaches every chat and prescription endpoint in [SEC-008](SEC-008-unauthenticated-sensitive-routes.md).

## Impact

- **Confidentiality:** any ciphertext produced by the platform, ever, can be decrypted on demand by an anonymous caller. This includes credentials and PHI.
- **Integrity:** arbitrary valid ciphertext can be minted, defeating the payload layer as a gate on every endpoint that relies on it.
- **Availability:** minor — each call performs crypto work and is unauthenticated, offering a cheap amplification primitive.
- **Remediation dependency:** rotating the key in SEC-004 accomplishes nothing while these endpoints exist. They must be removed **first** or in the same change.

## Remediation

Delete all three routes and all three handlers. They have no production purpose.

```diff
--- a/routes/authRoutes.js
@@
-router.post('/encrypt',  AuthController.encryptDataSample);
-router.post('/decrypt',  AuthController.decryptDataSample);
-router.get ('/getquery', AuthController.getQueryStr);
```

Then remove `encryptDataSample`, `decryptDataSample` and `getQueryStr` from `controllers/authController.js:80-134`.

If a developer tool for crafting payloads is genuinely needed, it must live **outside the deployed application** — a local script run against a development key:

```js
// tools/encrypt-payload.js  — dev only, never mounted, never deployed
// usage: PAYLOAD_ENC_KEY=<dev key> node tools/encrypt-payload.js '{"email":"a@b.c"}'
const { encryptData } = require('../config/encryption');
console.log(JSON.stringify(encryptData(process.argv[2])));
```

Add a guard so this class of endpoint cannot return in future — a startup assertion or a route-inventory test that fails if any router mounts a handler whose name matches `/sample|debug|test/i`.

While auditing this file, note that `routes/authRoutes.js:14` (`/ssologin`) and `:15` (`/sso-client-login`) also lack `validateDataEncryption()`, so their bodies — including `client_secret` — are handled and logged in plaintext ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).

## Verification

1. **Routes gone:** `curl -X POST https://<host>/api/auth/decrypt -d '{}'` returns **404**. Same for `/encrypt` and `/getquery`.
2. **Handlers gone:** `grep -n "encryptDataSample\|decryptDataSample\|getQueryStr" -r . --include=*.js | grep -v node_modules` returns nothing.
3. **Route inventory:** enumerate the mounted route table at boot and confirm no route outside `/api/auth/{register,login,...}` accepts `encryptedData` without authentication.
4. **Ordering check:** confirm this change is deployed **before or with** the SEC-004 key rotation, not after.

## References

- OWASP Top 10 2021 — [A01:2021 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- OWASP ASVS 4.0.3 — V14.2 Dependency and Configuration; V1.4 Access Control Architecture
- CWE-306 — [Missing Authentication for Critical Function](https://cwe.mitre.org/data/definitions/306.html)
- CWE-200 — [Exposure of Sensitive Information to an Unauthorized Actor](https://cwe.mitre.org/data/definitions/200.html)
