# SEC-004 — Payload encryption uses a hardcoded key and a fixed IV, both committed to git

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 9.1 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A02:2021 – Cryptographic Failures |
| OWASP ASVS 4.0.3 | V6.2.1 – No custom crypto; V6.2.5 – Approved modes with authenticated encryption; V6.2.7 – IVs generated with a CSPRNG and never reused; V6.4.1 – Key management and rotation |
| CWE | CWE-798 – Use of Hard-coded Credentials; CWE-329 – Generation of Predictable IV with CBC Mode; CWE-353 – Missing Support for Integrity Check |
| Status | Open |
| Affected component | `config/encryption.js`, `middleware/validateDataEncryption.js`, `helpers/commonHelper.js` |

## Summary

The application wraps request and response bodies in an AES-256-CBC layer that it treats as a security control. That layer uses a **32-character ASCII string literal as the key and a fixed hex string as the IV**, both hardcoded in `config/encryption.js`, which is **tracked in git**. The same constant IV is used for every message the platform has ever produced, and no MAC or authenticated mode is applied.

Anyone with read access to the repository — or to the bundled frontend, or to the published history — holds the key to every encrypted request and response, including login payloads. The control provides no confidentiality against any attacker who has ever seen the source.

Three independent defects are present: a hardcoded key, a static IV, and unauthenticated encryption. Each alone would be serious.

## Affected code

`config/encryption.js:4-7` — key and IV (values redacted here; they are plaintext literals in the file):

```js
const algorithm = 'aes-256-cbc';                  // AES-256 requires a 32-byte key
const key = 'akos…';                              // 32-char ASCII literal, used raw as the key
const iv  = '1dfd…';                              // 32 hex chars = one fixed 16-byte IV, forever
const ivBuffer = Buffer.from(iv, 'hex');
```

The commented-out remnants on the same lines (`//crypto.randomBytes(32)` and `//crypto.randomBytes(16)`) show that correct generation was written first and then replaced with constants.

`config/encryption.js:9-20` — every encryption reuses `ivBuffer` and returns it to the client:

```js
function encryptData(plaintext) {
    try {
        const cipher = crypto.createCipheriv(algorithm, key, ivBuffer);      // :12  same IV every call
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return { IV: ivBuffer.toString('hex'), encryptedData: encrypted };   // :16
    } catch (error) {
        // swallowed — see Technical detail
    }
}
```

Git confirms the file is tracked:

```
$ git ls-files | grep encryption
config/encryption.js
```

Consumers — this layer covers effectively the whole API surface:

- `middleware/validateDataEncryption.js:8,16,20` — decrypts inbound params, body and query on nearly every route.
- `helpers/commonHelper.js:29,46` — `sendSuccess` and `sendError` encrypt every outbound response body.

## Technical detail

**Hardcoded key.** The key is a literal in a git-tracked file. Rotating it requires a code change and a coordinated frontend release, so in practice it never rotates. Every historical commit contains it, so removing it from `HEAD` does not remove it from the repository — history rewriting plus key rotation is required (see [SEC-010](SEC-010-committed-third-party-credentials.md)).

Note the key is used as a raw 32-character ASCII string. The effective keyspace is therefore not 256 bits but the entropy of a chosen English-ish phrase — far lower. This is secondary to the key being public, but it means even a *secret* key of this form would be weak.

**Static IV under CBC.** CBC XORs the IV into the first plaintext block. With a fixed IV, encryption becomes deterministic: identical plaintexts always produce identical ciphertexts, and two ciphertexts sharing a prefix reveal that their plaintexts share a 16-byte-aligned prefix. An observer who can see traffic (or stored ciphertexts) can:

- detect that two users submitted the same value without decrypting anything;
- build a dictionary of known plaintext → ciphertext for low-entropy fields and read them by lookup;
- track a given patient or query across sessions by ciphertext equality.

**No authentication.** CBC without a MAC is malleable. Flipping a bit in ciphertext block *n* flips the corresponding bit in plaintext block *n+1*. Because `decryptData` has no integrity check, an attacker can make controlled, targeted modifications to a request body without knowing the key at all. Combined with the differing error paths described in [SEC-029](SEC-029-decryption-middleware-defects.md), the decryption routine is also a candidate padding oracle.

**Errors are swallowed.** The `catch` at `:17-19` returns `undefined` rather than throwing. A caller receiving `undefined` and spreading it into a response emits a body with no `encryptedData` field at all — a fail-open path that is silent in the logs.

**The asymmetry is the tell.** The application invests heavily in encrypting data *in transit at the application layer* — and the key is public — while storing the same PHI *unencrypted at rest* ([SEC-024](SEC-024-phi-unencrypted-at-rest.md)) and writing plaintext request bodies into a database log table ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)). The layer creates an impression of protection that its implementation does not deliver.

## Exploit scenario

**Decrypting captured traffic**

1. Attacker clones the public repository, or pulls the key out of the shipped frontend bundle (the browser must hold it to speak to the API), or reads it from any historical commit.
2. Attacker captures encrypted request bodies — from a compromised proxy, a shared network, browser history, an error report, or the `logs` table.
3. Attacker decrypts them with the known key and IV, recovering login credentials and PHI in plaintext.

**Forging requests**

1. Using the same key, the attacker encrypts an arbitrary body, e.g. `{ email: 'victim@company.com', newPassword: 'Attacker#1' }`.
2. They submit it to `POST /api/forgot-password/change-password`. The middleware decrypts it successfully because the ciphertext is validly formed.
3. This is the delivery mechanism that makes [SEC-002](SEC-002-unauthenticated-password-reset.md), [SEC-006](SEC-006-sql-injection.md) and [SEC-008](SEC-008-unauthenticated-sensitive-routes.md) reachable by an outsider: the "encryption" is not an access control, and treating it as one is the reason those endpoints were left unauthenticated.

**Inference without the key**

Even an attacker who somehow lacks the key can exploit the static IV: submit a known value (their own name, a known diagnosis code), record the ciphertext, then scan captured traffic for the same ciphertext to identify other users who submitted it.

## Impact

- **Confidentiality:** the application-layer encryption provides no protection. All request and response bodies, including credentials and PHI, are readable by anyone with repo or bundle access.
- **Integrity:** unauthenticated CBC permits targeted bit-flipping of request contents.
- **Availability:** not directly affected, though the swallowed-error path can produce malformed responses.
- **Systemic:** this finding is the enabler for several others. The team appears to have treated this layer as a substitute for authentication on chat, prescription and OpenTok routes.
- **Regulatory:** a key committed to a source repository is not a key. If the repository is public (see *Open question* below), this is an active disclosure requiring immediate rotation and breach assessment.

## Remediation

Do not patch this in place — replace the module. The target is AES-256-GCM, a key from the environment, and a fresh random IV per message. `helpers/aesCryptoHelper.js:8` already does the IV correctly and can serve as the in-repo reference.

```js
// config/encryption.js
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES  = 12;    // 96-bit nonce, the GCM standard
const TAG_BYTES = 16;

function loadKey() {
    const raw = process.env.PAYLOAD_ENC_KEY;
    if (!raw) throw new Error('PAYLOAD_ENC_KEY is not set');   // fail closed at boot
    const key = Buffer.from(raw, 'hex');
    if (key.length !== 32) throw new Error('PAYLOAD_ENC_KEY must be 32 bytes (64 hex chars)');
    return key;
}
const KEY = loadKey();

function encryptData(plaintext) {
    const iv = crypto.randomBytes(IV_BYTES);                   // fresh per message — never reuse
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        IV: iv.toString('hex'),
        tag: tag.toString('hex'),
        encryptedData: ciphertext.toString('hex'),
    };
    // No try/catch: a crypto failure must propagate, never fail open.
}

function decryptData(encryptedData, ivHex, tagHex) {
    const iv  = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new Error('Malformed ciphertext');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);                                  // integrity enforced here
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedData, 'hex')),
        decipher.final(),                                      // throws on tampering
    ]).toString('utf8');
}

module.exports = { encryptData, decryptData };
```

Accompanying actions, in order:

1. **Generate a new key** — `openssl rand -hex 32` — and set `PAYLOAD_ENC_KEY` in the environment. Never in source.
2. **Treat the old key as public.** Assume every payload ever encrypted with it is compromised.
3. **Scrub git history** (`git filter-repo` or BFG) and force-push, after confirming with all clone holders. See [SEC-010](SEC-010-committed-third-party-credentials.md), which must be handled in the same operation.
4. **Coordinate the frontend release** — clients must send `tag` and a per-message `IV`, and the wire format changes. Plan a dual-accept window if a flag-day cutover is not feasible, then remove the legacy path.
5. **Do not treat this layer as authentication.** Fix [SEC-008](SEC-008-unauthenticated-sensitive-routes.md) independently. Payload encryption is defence in depth over TLS, not an access control.
6. **Delete the oracle endpoints** in [SEC-005](SEC-005-public-crypto-oracle-endpoints.md) — with them in place, a new key is defeated on day one.

## Verification

1. **No literals:** `grep -nE "const (key|iv) *= *'" config/encryption.js` returns nothing.
2. **Fail-closed boot:** start the process with `PAYLOAD_ENC_KEY` unset — it must refuse to start, not start with a fallback.
3. **IV uniqueness:** encrypt the same plaintext 1000 times; collect the `IV` values; all 1000 must be distinct. Before the fix, all 1000 are identical.
4. **Ciphertext non-determinism:** encrypt the same plaintext twice; `encryptedData` must differ.
5. **Tamper detection:** flip one byte of a valid `encryptedData` and submit it. Decryption must throw and the request must be rejected with a generic error — not partially processed.
6. **History:** after scrubbing, `git log --all -S'akos' -- config/encryption.js` returns no commits.

## Open question for the owner

Is `github.com/akosmd7428/akospatientapi` **public or private**? If public, this key has been world-readable for the life of the repository and rotation is an emergency, not a scheduled task. The answer also determines whether a breach notification assessment is required. This document is written at Critical severity on the assumption of repository access by any current or former contributor; public exposure would make it Critical-with-active-disclosure.

## References

- OWASP Top 10 2021 — [A02:2021 Cryptographic Failures](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/)
- OWASP — [Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V6 Stored Cryptography Verification Requirements
- NIST SP 800-38D — Galois/Counter Mode (GCM)
- CWE-329 — [Generation of Predictable IV with CBC Mode](https://cwe.mitre.org/data/definitions/329.html)
- CWE-798 — [Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
