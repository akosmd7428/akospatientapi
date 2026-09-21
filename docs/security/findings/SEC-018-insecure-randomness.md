# SEC-018 — `Math.random()` used for OTPs and security-relevant identifiers

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 7.4 (`AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A02:2021 – Cryptographic Failures |
| OWASP ASVS 4.0.3 | V6.3.1 – Random values generated with a CSPRNG; V6.3.2 – GUIDs use a cryptographically secure source; V2.7.2 – OTPs generated securely |
| CWE | CWE-338 – Use of Cryptographically Weak PRNG; CWE-330 – Use of Insufficiently Random Values |
| Status | Open |
| Affected component | `helpers/otpHelper.js`, `services/forgotPasswordService.js`, `services/patientService.js`, `services/migrationService.js`, `controllers/*` |

## Summary

`Math.random()` is used in sixteen places to generate values that carry security weight — most seriously the **password-reset OTP**, and also unique patient identifiers, prescription identifiers and lab booking identifiers.

`Math.random()` is a non-cryptographic PRNG. V8 implements it as xorshift128+, whose 128-bit internal state can be recovered from a modest number of observed outputs, after which all subsequent values are predictable. It is explicitly documented as unsuitable for security purposes.

Node's `crypto.randomInt` and `crypto.randomBytes` are drop-in replacements, and `helpers/commonHelper.js:76` already uses `crypto.randomBytes` correctly — so the right primitive is present in the codebase and simply was not used here.

## Affected code

**The password-reset OTP** — `helpers/otpHelper.js:5`:

```js
const otp = Math.floor(100000 + Math.random() * 900000).toString();
```

**Identifier generation:**

| File:line | Value |
|---|---|
| `services/forgotPasswordService.js:84` | `uniquePatientId` |
| `services/patientService.js:623, 636, 1209, 1381` | prescription and unique identifiers |
| `services/migrationService.js:146, 200` | 6-digit identifiers |
| `controllers/careNavigatorController.js:406` | prescription identifier |
| `controllers/hrController.js:302, 495` | identifiers |
| `controllers/labTestController.js:328, 405` | lab booking identifiers |
| `routes/labTestController.js:311, 366` | duplicate of the above in a stale file ([SEC-033](SEC-033-stale-duplicate-sources.md)) |
| `services/labTestService.js:2869` | identifier |

**The correct pattern, already in the codebase** — `helpers/commonHelper.js:73-93` builds a UUIDv4 from `crypto.randomBytes(16)` with proper version and variant bits.

## Technical detail

**State recovery.** V8's `Math.random()` uses xorshift128+ seeded once per context. Published techniques recover the full internal state from as few as three to five consecutive outputs — typically by feeding observed doubles into an SMT solver — after which every subsequent output is deterministic. The attack is well-documented and tooling is publicly available.

This matters concretely here: `patientService.js` generates identifiers with `Math.random()` and returns several of them to the caller in normal API responses. An attacker who creates a few records observes those outputs, recovers the state, and predicts the OTP that `otpHelper` will generate next — **without guessing**.

**Shared generator.** All `Math.random()` calls in a process draw from one stream. Outputs an attacker legitimately observes (a booking id in their own response) leak information about outputs they must not observe (another user's OTP).

**Brute force, as a fallback.** Even without state recovery, a 6-digit OTP is a 10⁶ space. With no attempt counter, no lockout and only a 1000-per-15-minutes global limit ([SEC-021](SEC-021-insufficient-anti-automation.md)), exhaustive search is feasible across a handful of source addresses. `Math.floor(100000 + Math.random() * 900000)` is also never zero-padded, which is correct here — but note the range is 100000–999999, confirming exactly 900,000 possibilities.

**Predictable identifiers enable enumeration.** Prescription and booking identifiers appear in URLs under `/assets/prescriptions/`, which is served publicly with no authentication ([SEC-023](SEC-023-unauthenticated-static-phi.md)). Predictable identifiers plus unauthenticated static serving equals direct PHI retrieval.

**Important context.** The OTP weakness is currently moot for account takeover, because [SEC-002](SEC-002-unauthenticated-password-reset.md) lets an attacker skip the OTP entirely. Once SEC-002 is fixed, this finding becomes the primary attack path against password reset — so the two must be fixed together. Fixing SEC-002 alone would leave a predictable OTP as the sole barrier.

## Exploit scenario

**Predicting an OTP via state recovery**

1. Attacker creates several lab bookings or prescriptions through normal API calls, collecting the returned `Math.random()`-derived identifiers.
2. Attacker recovers the V8 PRNG state from those outputs.
3. Attacker triggers a password reset for the victim: `POST /api/forgot-password/send-otp`.
4. The OTP is generated from the next value in the stream — which the attacker computes rather than guesses.
5. Attacker submits it to `verify-otp` and completes the takeover on the first attempt, leaving no failed-attempt signal.

**Brute force**

6. Without state recovery, the attacker simply enumerates 900,000 candidates. `validateOtp` has no attempt counter, and the OTP is not deleted on success, so it remains valid for its full 5-minute window.

**Identifier enumeration**

7. Attacker predicts prescription identifiers and fetches `https://patientportalapi.akosmd.in/assets/prescriptions/prescription_<id>.pdf` directly — no authentication required.

## Impact

- **Confidentiality:** predictable OTPs enable account takeover; predictable identifiers enable direct retrieval of prescription PDFs.
- **Integrity:** takeover permits writes to clinical records.
- **Detection:** a predicted OTP succeeds first time, producing no failed-attempt signal — the attack is quiet.
- **Compliance:** NIST SP 800-63B requires out-of-band authenticator secrets to be generated with an approved random bit generator.

## Remediation

**Step 1 — replace every occurrence.** `crypto.randomInt` is synchronous, unbiased and drop-in:

```js
// helpers/otpHelper.js
const crypto = require('crypto');

const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
```

Note `randomInt(0, 1_000_000)` plus zero-padding uses the full 10⁶ space, where `100000 + random*900000` uses only 9×10⁵. Rejection sampling inside `randomInt` also avoids the modulo bias a naive `% 1000000` would introduce.

**Step 2 — identifiers.** For anything appearing in a URL or used as a lookup key, use a value large enough that guessing is infeasible:

```js
const crypto = require('crypto');

// 128 bits, URL-safe, unguessable.
const newPublicId = () => crypto.randomBytes(16).toString('hex');

// Where a human-readable reference is required, combine a sequence with random entropy.
const newBookingRef = (seq) => `LB${String(seq).padStart(6, '0')}-${crypto.randomBytes(4).toString('hex')}`;
```

Reuse the existing `helpers/commonHelper.js:73-93` UUID generator where a UUID is appropriate, rather than adding a new one.

**Step 3 — do not rely on identifier entropy for authorisation.** Unguessable identifiers raise cost; they are not access control. `/assets` must still be authenticated ([SEC-023](SEC-023-unauthenticated-static-phi.md)).

**Step 4 — harden the OTP lifecycle** alongside this change (detailed in [SEC-021](SEC-021-insufficient-anti-automation.md)):

```js
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

async function issueOtp(email) {
    const otp = generateOtp();
    await OtpStore.set(email, {                       // shared store, not an in-process Map
        hash: sha256(otp),                            // store the hash, not the OTP
        expiresAt: Date.now() + OTP_TTL_MS,
        attempts: 0,
    });
    return otp;
}

async function validateOtp(email, supplied) {
    const rec = await OtpStore.get(email);
    if (!rec || Date.now() > rec.expiresAt) return false;
    if (rec.attempts >= MAX_ATTEMPTS) { await OtpStore.delete(email); return false; }

    await OtpStore.increment(email, 'attempts');
    const ok = crypto.timingSafeEqual(Buffer.from(sha256(supplied)), Buffer.from(rec.hash));
    if (ok) await OtpStore.delete(email);             // single use — the current code never deletes
    return ok;
}
```

**Step 5 — add a lint rule** banning `Math.random()` outside test files, so this cannot recur.

**Step 6 — clean up the stale duplicates** at `routes/labTestController.js:311,366` — or delete the file ([SEC-033](SEC-033-stale-duplicate-sources.md)).

## Verification

1. **Static check:** `grep -rn "Math.random()" --include=*.js . | grep -v node_modules | grep -v test` returns nothing; the lint rule fails a deliberate reintroduction.
2. **OTP distribution:** generate 100,000 OTPs and confirm uniform distribution across 000000–999999, including values below 100000 (which the old implementation could never produce).
3. **Single use:** verify an OTP, then replay it. The second attempt must fail.
4. **Attempt cap:** submit six wrong OTPs; the sixth must be rejected even if correct, and the record invalidated.
5. **Predictability:** collect 20 consecutive generated identifiers and confirm no sequence or state-recovery relationship.
6. **Identifier length:** confirm public identifiers are at least 128 bits of entropy.

## References

- OWASP — [Cryptographic Storage Cheat Sheet: secure random number generation](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html#secure-random-number-generation)
- Node.js — [`crypto.randomInt`](https://nodejs.org/api/crypto.html#cryptorandomintmin-max-callback)
- MDN — [`Math.random()` is not cryptographically secure](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random)
- NIST SP 800-63B §5.1.3.1 — Out-of-Band Authenticators
- CWE-338 — [Use of Cryptographically Weak PRNG](https://cwe.mitre.org/data/definitions/338.html)
