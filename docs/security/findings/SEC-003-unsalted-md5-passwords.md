# SEC-003 — Passwords stored and compared as unsalted MD5

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 9.1 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A02:2021 – Cryptographic Failures |
| OWASP ASVS 4.0.3 | V2.4.1 – Passwords stored with an approved one-way KDF; V2.4.3 – PBKDF2/bcrypt/argon2 with appropriate work factor; V2.4.5 – Additional iteration count/work factor |
| CWE | CWE-916 – Use of Password Hash With Insufficient Computational Effort; CWE-759 – Use of a One-Way Hash without a Salt |
| Status | Open |
| Affected component | `services/authService.js`, `services/forgotPasswordService.js`, `controllers/authController.js`, `controllers/hrController.js`, `services/migrationService.js` |

## Summary

Every password in the system — patient, care navigator and HR — is stored as an **unsalted MD5 digest**. MD5 is a fast general-purpose hash, not a password KDF: commodity GPUs compute tens of billions of MD5 hashes per second, and unsalted digests are directly reversible via precomputed rainbow tables for the vast majority of human-chosen passwords.

`bcryptjs` is installed and is used for hashing on a registration path, but `login` never calls `bcrypt.compare` — it compares MD5 digests. The bcrypt path is therefore dead code, and any account created through it can never authenticate.

Password comparison additionally uses `===` on the digest strings, which is not constant-time.

## Affected code

`services/authService.js:45-51` — the login comparison:

```js
// Create the MD5 hash of the plaintext password
const hash = crypto.createHash('md5').update(password).digest('hex');   // :46
// Compare the hashed password with the stored hash
const passwordMatch = hash === user.password;                           // :48  non-constant-time
if (!passwordMatch) {
    throw new Error('Invalid email or password');
}
```

`services/authService.js:12` — the dead bcrypt path in `register`:

```js
const hashedPassword = await bcrypt.hash(password, 10);
```

Nothing that writes a password elsewhere uses bcrypt, and nothing that reads one uses `bcrypt.compare`. An account registered through this path stores a `$2a$…` string, which `authService.js:48` will compare against an MD5 hex digest — it can never match.

Every other write site uses MD5:

| File:line | Context |
|---|---|
| `services/forgotPasswordService.js:83` | password reset (see SEC-002) |
| `controllers/authController.js:257` | account creation |
| `controllers/authController.js:298` | SSO login path |
| `controllers/authController.js:444` | password change |
| `controllers/hrController.js:271` | HR-created employee accounts |
| `services/migrationService.js:50` | bulk data migration |

`controllers/hrController.js:269-271` is worth quoting in full, because it combines three problems:

```js
const password = 'Akos…';                                                   // :269  hardcoded default, 11 chars
//const hashedPassword = await bcrypt.hash(password, 10);                   // :270  bcrypt commented out
const hashedPassword = crypto.createHash('md5').update(password).digest('hex');   // :271
```

Every employee account created by an HR user receives the same known password, hashed with MD5. The bcrypt line sitting commented out directly above indicates the weakness was introduced deliberately and knowingly — see [SEC-035](SEC-035-hardcoded-default-password.md).

## Technical detail

Three distinct defects compound here.

**No salt.** Identical passwords produce identical digests across all accounts. An attacker with the `patient` table can group users by digest to find shared passwords, and can crack the entire table in a single pass rather than per-account. the MD5 of the hardcoded default (see [SEC-035](SEC-035-hardcoded-default-password.md)) is a single constant that identifies every unmigrated HR-created account at a glance.

**No work factor.** MD5 is designed to be fast. Published benchmarks put a single modern GPU at roughly 50–100 GH/s for MD5; an 8-character mixed-case alphanumeric keyspace (~2.2×10¹⁴) falls in under an hour, and dictionary-plus-rules attacks recover typical human passwords in seconds. bcrypt at cost 12 is roughly 10⁹ times slower per guess.

**Precomputation.** Because the digests are unsalted, they are also lookups. Public rainbow tables and online reverse-MD5 services resolve common passwords without any local computation at all.

**Non-constant-time comparison.** `hash === user.password` short-circuits on the first differing character. In principle this leaks digest bytes via timing; in practice, over a network and against a fast hash, this is the least of the problems here — but it is trivially fixed and should be.

The consequence is that the password column provides essentially no protection. Any event that exposes the database — the SQL injection in [SEC-006](SEC-006-sql-injection.md), the `root`-with-empty-password configuration in [SEC-030](SEC-030-database-root-empty-password.md), a backup leak, or an insider — yields plaintext credentials for the entire user base. Given widespread password reuse, the blast radius extends well beyond this application.

## Exploit scenario

1. Attacker exploits [SEC-006](SEC-006-sql-injection.md) — unauthenticated SQL injection reachable through the `companyId` header on the chat routes — to run `UNION SELECT email, password FROM patient`.
2. The result is a list of email addresses paired with 32-character hex digests.
3. Attacker runs `hashcat -m 0 -a 0 dump.txt rockyou.txt -r best64.rule`. On a single consumer GPU this recovers the majority of the table in minutes.
4. Attacker logs in as any recovered user through the normal `POST /api/auth/login` endpoint — no exploitation required, and the access is indistinguishable from legitimate traffic in the logs.
5. Recovered credentials are replayed against the users' email providers and other services.

An attacker who does not have the database at all can still exploit the design: the hardcoded default password is in git-tracked source ([SEC-035](SEC-035-hardcoded-default-password.md)), so spraying it across the platform's employee accounts (enumerated via [SEC-028](SEC-028-account-enumeration.md)) will succeed against every account that has not changed it.

## Impact

- **Confidentiality:** a single database exposure yields plaintext credentials for every patient, clinician and HR user; the digests offer no meaningful delay.
- **Integrity:** recovered credentials permit authenticated writes to clinical records.
- **Availability:** not directly affected.
- **Regulatory:** HIPAA §164.312(a)(2)(iv) and §164.312(e)(2)(ii) call for encryption mechanisms appropriate to the risk; unsalted MD5 has been unacceptable for password storage since the mid-2000s and would be treated as a failure of reasonable safeguards. Credential reuse means the harm propagates to systems outside this application's scope.

## Remediation

Migrate to bcrypt (cost ≥ 12) or argon2id, with transparent rehashing on next successful login so no user is locked out and no password reset campaign is required.

**1. Centralise password handling in one module**

```js
// helpers/passwordHelper.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const BCRYPT_COST = 12;

const hashPassword = (plaintext) => bcrypt.hash(plaintext, BCRYPT_COST);

const isLegacyMd5 = (stored) => /^[a-f0-9]{32}$/i.test(stored);

const verifyPassword = async (plaintext, stored) => {
    if (!stored) {
        await bcrypt.hash(plaintext, BCRYPT_COST);   // constant work: avoid a user-enumeration timing oracle
        return { ok: false, needsRehash: false };
    }
    if (isLegacyMd5(stored)) {
        const legacy = crypto.createHash('md5').update(plaintext).digest('hex');
        const ok = crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored.toLowerCase()));
        return { ok, needsRehash: ok };              // correct legacy password -> upgrade it now
    }
    const ok = await bcrypt.compare(plaintext, stored);
    return { ok, needsRehash: false };
};

module.exports = { hashPassword, verifyPassword, BCRYPT_COST };
```

**2. Rehash on login**

```js
// services/authService.js
const { hashPassword, verifyPassword } = require('../helpers/passwordHelper');

const { ok, needsRehash } = await verifyPassword(password, user.password);
if (!ok) throw new Error('Invalid email or password');

if (needsRehash) {
    const upgraded = await hashPassword(password);
    await user.update({ password: upgraded });   // silent, one-time, per user
}
```

**3. Replace every write site** listed in *Affected code* with `hashPassword(...)`. After the migration window (track the count of remaining 32-hex digests), delete the legacy branch from `verifyPassword` so MD5 can never be accepted again.

**4. Dependency hygiene** — `package.json` declares both `bcrypt` (native, never imported) and `bcryptjs` (pure JS, actually used). Remove the unused `bcrypt` dependency; see [SEC-022](SEC-022-vulnerable-dependencies.md). If throughput matters, standardise on native `bcrypt` instead and remove `bcryptjs` — but pick exactly one.

**5. Remove the hardcoded default password** at `hrController.js:269` — see [SEC-035](SEC-035-hardcoded-default-password.md).

## Verification

1. **New account:** create an account and inspect the stored value — it must start with `$2a$12$` or `$2b$12$`, not be 32 hex characters.
2. **Legacy login:** take an existing MD5 account, log in with the correct password, confirm login succeeds **and** that the stored value has been replaced with a bcrypt hash.
3. **Legacy login, wrong password:** confirm it still fails and the stored hash is unchanged.
4. **Migration progress:** `SELECT COUNT(*) FROM patient WHERE password REGEXP '^[a-f0-9]{32}$';` — this must trend to zero. Run the same query against `careNavigator` and `hr`.
5. **Static check:** `grep -rn "createHash('md5')" --include=*.js . | grep -v node_modules` returns only the single legacy branch in `passwordHelper.js`.
6. **Work factor:** time a login; bcrypt at cost 12 should add roughly 200–400 ms. If it is imperceptible, the cost factor did not take effect.

## References

- OWASP Top 10 2021 — [A02:2021 Cryptographic Failures](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/)
- OWASP — [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V2.4 Credential Storage Requirements
- NIST SP 800-63B §5.1.1.2 — Memorized Secret Verifiers
- CWE-916 — [Use of Password Hash With Insufficient Computational Effort](https://cwe.mitre.org/data/definitions/916.html)
