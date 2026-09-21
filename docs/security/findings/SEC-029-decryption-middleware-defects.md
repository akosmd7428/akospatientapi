# SEC-029 — Decryption middleware: implicit global, no error handling, padding-oracle exposure

| Field | Value |
|---|---|
| Severity | **Medium** |
| CVSS v3.1 | 6.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L`) |
| OWASP Top 10 2021 | A04:2021 – Insecure Design; A02:2021 – Cryptographic Failures |
| OWASP ASVS 4.0.3 | V6.2.5 – Authenticated encryption used; V6.2.8 – Cryptographic operations are constant-time; V7.4.1 – Generic error messages |
| CWE | CWE-1188 – Insecure Default Initialization of Resource; CWE-209 – Information Exposure Through an Error Message; CWE-696 – Incorrect Behavior Order |
| Status | Open |
| Affected component | `middleware/validateDataEncryption.js` |

## Summary

The middleware that decrypts inbound request payloads has three implementation defects, independent of the key-management problems in [SEC-004](SEC-004-hardcoded-aes-key-static-iv.md).

1. It assigns to `data` **without `const` or `let`**, creating an implicit global shared by every concurrent request.
2. It calls `decryptData` with no null guard and no try/catch, so a malformed or plaintext body throws synchronously inside middleware — before authentication runs.
3. Because the cipher is CBC with no MAC, and because failure modes produce distinguishable errors, the endpoint exhibits padding-oracle behaviour.

Defect 1 is not currently exploitable — there is no `await` between the assignment and its use — but it is one refactor away from leaking one user's decrypted request body into another user's request.

## Affected code

`middleware/validateDataEncryption.js:7-22`:

```js
if (req.params && Object.keys(req.params).length > 0 && req.params.encryptedData) {
    data = decryptData(req.params.encryptedData, req.params.IV);      // :8  no const/let
    req.params = JSON.parse(data);                                    // :9
}
...
if (req.body && Object.keys(req.body).length > 0) {
    data = decryptData(req.body.encryptedData, req.body.IV);          // :16  no guard, no try/catch
    req.body = JSON.parse(data);                                      // :17
}
if (req.query && Object.keys(req.query).length > 0) {
    data = decryptData(req.query.encryptedData, req.query.IV);        // :20
    req.query = JSON.parse(data);                                     // :21
}
```

Note the asymmetry: the `params` branch at `:7` checks `req.params.encryptedData` exists; the `body` and `query` branches at `:15` and `:19` check only that the object is non-empty, then dereference `encryptedData` and `IV` regardless.

Ordering — several routers place this middleware *before* authentication:

```js
// routes/hrRoutes.js:11
router.post('/preemployee', validateDataEncryption(), validateSchema(preEmpAddSchema), jwtAuthHr, HrController.add);
// routes/forgotPasswordRoutes.js:14
router.post('/change_password', validateDataEncryption(), validateSchema(changePasswordValidation), jwtAuth, ...);
```

## Technical detail

**Implicit global.** In non-strict mode, assigning to an undeclared identifier creates a property on the global object. Every request handled by this process writes to the same `global.data`. Today the sequence `data = decryptData(...)` → `JSON.parse(data)` is synchronous with no yield point, so Node's single-threaded execution guarantees no interleaving. That safety is incidental, not designed. Adding any `await` between those lines — an audit log, a key-vault lookup, a cache read — would let request B overwrite `data` between request A's assignment and use, and A would then parse **B's decrypted body**. In a PHI system, that is a cross-patient data leak arising from a one-word omission.

The file also lacks `'use strict'`, which would have made this a `ReferenceError` at the first request.

**No error handling.** `decryptData(undefined, undefined)` reaches `Buffer.from(undefined, 'hex')` and throws. A body of `{"a":1}` is non-empty, so the branch executes, `encryptedData` is `undefined`, and the middleware throws synchronously. Express catches synchronous throws in middleware and forwards them, landing at `index.js:98`, which returns `err.message` to the client ([SEC-025](SEC-025-verbose-error-disclosure.md)). So any client sending plaintext to an encrypted route receives a 500 containing crypto internals — unauthenticated, on every such route.

**Padding oracle.** AES-CBC without a MAC is malleable, and decryption failures are distinguishable from parse failures:

| Attacker input | Error surfaced |
|---|---|
| Invalid padding | `error:1C800064:Provider routines::bad decrypt` |
| Valid padding, invalid UTF-8/JSON | `Unexpected token … in JSON` |
| Valid padding and JSON | proceeds to the handler |

That three-way discrimination is exactly what a padding-oracle attack requires: it lets an attacker decrypt arbitrary ciphertext, byte by byte, without the key. The attack is somewhat academic here given that the key is public ([SEC-004](SEC-004-hardcoded-aes-key-static-iv.md)) and a decryption oracle is exposed outright ([SEC-005](SEC-005-public-crypto-oracle-endpoints.md)) — but it must be closed as part of the migration to GCM, or rotating the key will not deliver the protection it appears to.

**Ordering.** Running decryption and validation before authentication means unauthenticated input reaches cryptographic code. Every defect above is therefore reachable pre-auth.

## Exploit scenario

**Unauthenticated 500 and information disclosure**

1. Attacker sends `POST /api/auth/login` with a plaintext body `{"a":1}`.
2. The middleware executes, `decryptData(undefined, undefined)` throws, and the global handler returns `err.message` — crypto library internals — to an unauthenticated caller.
3. Repeating this is a cheap way to generate error volume and to fingerprint the crypto stack.

**Padding oracle**

4. Attacker captures a ciphertext they wish to decrypt.
5. They submit modified variants and classify each response by error type.
6. Standard CBC padding-oracle technique recovers the plaintext byte by byte without the key.

**Cross-request leak (latent)**

7. A future change introduces an `await` between lines 16 and 17.
8. Under concurrency, request A parses request B's decrypted body — leaking one patient's data into another patient's request. No test would detect this, and it would present as an intermittent, unreproducible data-mixing bug.

## Impact

- **Confidentiality:** padding-oracle decryption; crypto internals disclosed to unauthenticated callers; latent cross-request PHI leakage.
- **Integrity:** unauthenticated CBC permits targeted bit-flipping of request contents.
- **Availability:** trivially triggered 500 on every encrypted route.
- **Latent severity:** the implicit global would be a Critical data-leak defect the moment an `await` is added.

## Remediation

**Step 1 — enable strict mode and declare variables** (the two-line change that eliminates the latent leak):

```js
'use strict';
// ...
const data = decryptData(req.body.encryptedData, req.body.IV);   // block-scoped, per request
```

Add `"strict": true` to the ESLint configuration and `no-undef` as an error, so this cannot recur anywhere in the codebase.

**Step 2 — guard, handle, and fail closed with a uniform error.**

```js
'use strict';
const { decryptData } = require('../config/encryption');
const { STATUS_CODE } = require('../config/constant');

function decryptSection(section) {
    if (!section || typeof section !== 'object') return null;
    const { encryptedData, IV, tag } = section;
    if (typeof encryptedData !== 'string' || typeof IV !== 'string' || typeof tag !== 'string') {
        return { error: 'MALFORMED' };
    }
    try {
        const plaintext = decryptData(encryptedData, IV, tag);   // GCM — see SEC-004
        return { value: JSON.parse(plaintext) };
    } catch (err) {
        return { error: 'MALFORMED' };      // one error class for BOTH decrypt and parse failure
    }
}

module.exports = () => (req, res, next) => {
    for (const key of ['params', 'body', 'query']) {
        const section = req[key];
        if (!section || Object.keys(section).length === 0) continue;

        const result = decryptSection(section);
        if (result === null) continue;
        if (result.error) {
            // Identical status, body and timing for every failure mode.
            return res.status(STATUS_CODE.HTTP_400_BAD_REQUEST).json({ message: 'Invalid request payload' });
        }
        req[key] = result.value;
    }
    return next();
};
```

The single `catch` covering both decryption and parsing is the control that closes the oracle: the attacker can no longer distinguish a padding failure from a parse failure.

**Step 3 — migrate to AES-256-GCM** ([SEC-004](SEC-004-hardcoded-aes-key-static-iv.md)). AEAD is the structural fix: with an authentication tag, tampered ciphertext is rejected before any padding is examined, so the oracle cannot exist. Steps 1 and 2 are mitigations; this is the remedy.

**Step 4 — reorder middleware so authentication runs first.**

```diff
-router.post('/preemployee', validateDataEncryption(), validateSchema(preEmpAddSchema), jwtAuthHr, HrController.add);
+router.post('/preemployee', requireAuth(ROLES.HR), validateDataEncryption(), validateSchema(preEmpAddSchema), HrController.add);
```

Apply across every router. This reduces pre-authentication attack surface generally, not only here.

**Step 5 — do not treat this middleware as an access control.** Its presence on a route says nothing about who may call it. Authentication must be applied independently on every route ([SEC-008](SEC-008-unauthenticated-sensitive-routes.md)).

## Verification

1. **Strict mode:** confirm `global.data` is `undefined` after handling requests; ESLint `no-undef` passes.
2. **Plaintext body:** send `{"a":1}` to an encrypted route. Must return a generic 400, not a 500 with crypto internals.
3. **Missing IV:** send `{"encryptedData":"ab"}` with no `IV`. Generic 400.
4. **Oracle test:** submit ciphertexts with (a) bad padding, (b) good padding but invalid JSON. Both must produce byte-identical responses, and timings must be indistinguishable.
5. **Tamper:** with GCM in place, flip one ciphertext byte — must be rejected by tag verification.
6. **Concurrency:** run 100 concurrent requests with distinct payloads and assert each response corresponds to its own request.
7. **Ordering:** confirm an unauthenticated request to a protected route returns 401 **before** any decryption is attempted.

## References

- OWASP — [Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- OWASP — [Padding Oracle Attack](https://owasp.org/www-community/attacks/Padding_Oracle_Attack)
- OWASP ASVS 4.0.3 — V6.2 Algorithms
- CWE-1188 — [Insecure Default Initialization of Resource](https://cwe.mitre.org/data/definitions/1188.html)
