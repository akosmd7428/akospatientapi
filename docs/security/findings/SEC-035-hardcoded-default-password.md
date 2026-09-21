# SEC-035 — Every HR-created employee account receives the same hardcoded password

| Field | Value |
|---|---|
| Severity | **Medium** |
| CVSS v3.1 | 6.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N`) |
| OWASP Top 10 2021 | A07:2021 – Identification and Authentication Failures; A02:2021 – Cryptographic Failures |
| OWASP ASVS 4.0.3 | V2.1.1 – Password length requirements; V2.3.1 – Initial passwords are randomly generated, ≥6 characters, and time-limited; V2.4.1 – Approved KDF |
| CWE | CWE-798 – Use of Hard-coded Credentials; CWE-521 – Weak Password Requirements; CWE-1392 – Use of Default Credentials |
| Status | Open |
| Affected component | `controllers/hrController.js` |

## Summary

When an HR user creates an employee account, the password is a hardcoded literal — the same value for every employee, on every tenant, since the feature was written. It is stored as unsalted MD5 ([SEC-003](SEC-003-unsalted-md5-passwords.md)), so the resulting digest is a single constant that identifies every account still using the default.

There is no forced password change on first login, no expiry on the initial credential, and no mechanism that tracks which accounts still hold it.

The line directly above shows a `bcrypt.hash` call commented out, so the weakening was deliberate and is visible in the source.

## Affected code

`controllers/hrController.js:269-271`:

```js
const  password = 'Akos…';                                                          // :269  hardcoded, 11 chars
//const hashedPassword = await bcrypt.hash(password, 10);                            // :270  bcrypt commented out
const hashedPassword = crypto.createHash('md5').update(password).digest('hex');      // :271  unsalted MD5
```

The literal is committed to git and therefore present in history ([SEC-010](SEC-010-committed-third-party-credentials.md)).

Surrounding context at `:267` shows the same handler reading tenant scope from the client-supplied header ([SEC-009](SEC-009-tenant-isolation-via-client-header.md)), and `:273` logs the email address ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).

## Technical detail

**A shared default is worse than a weak password.** A weak password compromises one account. A shared hardcoded default compromises *every account that has not changed it*, and the attacker needs to learn it only once — from the repository, from a single compromised account, or from one employee who mentions it.

**MD5 makes the population enumerable.** Because the hash is unsalted, `MD5('Akos…')` is one fixed 32-character string. An attacker holding a database dump ([SEC-006](SEC-006-sql-injection.md)) runs:

```sql
SELECT email FROM patient WHERE password = '<the constant>';
```

That single query returns the exact list of accounts still using the default — no cracking required. It converts a password-spraying attack into a targeted list.

**No forced rotation.** Nothing requires the employee to change it at first login, and nothing expires it. Accounts created months ago and never used still hold the default, and those are the least likely to be noticed.

**The password meets naive complexity rules** — upper case, lower case, a digit, a symbol — which is why it likely passed review. Complexity is irrelevant when the value is known. NIST SP 800-63B explicitly deprecates composition rules in favour of length, breach-list checks and, for initial credentials, randomness.

**Onboarding pressure is the usual cause.** A known default makes it easy to tell employees how to log in. The correct pattern achieves the same convenience with an invitation link, which is no harder for the user and does not create a standing credential.

## Exploit scenario

1. Attacker obtains the default password. Any of these suffice: reading `controllers/hrController.js` in the repository; being one of the employees onboarded with it; social engineering an HR user; or finding it in onboarding documentation.
2. Attacker enumerates employee email addresses ([SEC-028](SEC-028-account-enumeration.md)).
3. Attacker sprays the default across those addresses. Rate limiting is ineffective ([SEC-020](SEC-020-trust-proxy-and-xff-spoofing.md), [SEC-021](SEC-021-insufficient-anti-automation.md)) and there is no lockout.
4. Every account that has not changed its password authenticates successfully. Logins are indistinguishable from legitimate ones in the logs.
5. Each compromised account yields that employee's health records; with [SEC-001](SEC-001-broken-role-enforcement.md) and [SEC-009](SEC-009-tenant-isolation-via-client-header.md) it yields every tenant's records.
6. With a database dump, step 2 is unnecessary — the constant digest names the vulnerable accounts directly.

## Impact

- **Confidentiality:** unauthorised access to the health records of every employee who has not changed the default.
- **Integrity:** authenticated writes as those users.
- **Scale:** proportional to the number of never-logged-in accounts, which in an occupational-health product is typically a large share of the population.
- **Compliance:** NIST SP 800-63B §5.1.1.2 requires initial secrets to be randomly generated; HIPAA §164.308(a)(5)(ii)(D) requires password management procedures.

## Remediation

**Step 1 — replace the default with a single-use invitation token.** No password is set at creation at all:

```js
// controllers/hrController.js
const crypto = require('crypto');

// Create the account with NO usable password.
const employee = await Patient.create({
    email, first_name: name, phone, gender, dateofbirth,
    employer_id: req.user.companyIds[0],     // from the token — see SEC-009
    password: null,                           // cannot authenticate until set
    isProfileCompleted: 0,
});

// Issue a single-use, time-limited invitation.
const inviteRaw = crypto.randomBytes(32).toString('hex');
await Invitation.create({
    userId: employee.id,
    tokenHash: sha256(inviteRaw),             // store the hash, never the token
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
    usedAt: null,
});

await sendInvitationEmail(email, `${PORTAL_URL}/activate?token=${inviteRaw}`);
```

The activation endpoint validates the token, requires the user to choose a password, marks the invitation used, and only then writes a bcrypt hash ([SEC-003](SEC-003-unsalted-md5-passwords.md)).

Ensure `verifyPassword` treats a `null` stored password as an unconditional failure, while still performing equivalent work to avoid a timing oracle ([SEC-028](SEC-028-account-enumeration.md)).

**Step 2 — if an initial password is genuinely unavoidable,** generate it per account and force a change:

```js
const initialPassword = crypto.randomBytes(9).toString('base64url');   // ~12 chars, unique per account
const hashed = await bcrypt.hash(initialPassword, 12);
await Patient.create({ ..., password: hashed, mustChangePassword: true, passwordExpiresAt: in72Hours() });
```

`requireAuth` must then reject every request except the password-change endpoint while `mustChangePassword` is true.

**Step 3 — remediate the existing population.**

```sql
-- Identify affected accounts (the constant is the MD5 of the default).
SELECT id, email, isFirstLogin FROM patient WHERE password = '<md5 of the default>';
```

For each: invalidate the password (set to `null`), issue an invitation, and notify the user. Do this before publishing or widely circulating this document, since it names where the default lives.

**Step 4 — enforce a password policy** on the activation endpoint: minimum 12 characters, checked against a breached-password list (`zxcvbn` or the Have I Been Pwned range API), with no composition rules — per NIST SP 800-63B §5.1.1.2.

**Step 5 — add a CI check** that fails on a password-like literal assignment:

```bash
grep -rnE "(password|passwd|pwd)\s*=\s*['\"][^'\"]{6,}['\"]" --include=*.js controllers/ services/ helpers/
```

**Step 6 — remove the commented-out `bcrypt.hash` line** at `:270`. A commented-out secure implementation beside an insecure live one is a recurring pattern in this codebase ([SEC-004](SEC-004-hardcoded-aes-key-static-iv.md), [SEC-008](SEC-008-unauthenticated-sensitive-routes.md)) and is worth treating as a review smell in its own right.

## Verification

1. **No literal:** `grep -rn "Akos" controllers/ services/ | grep -i password` returns nothing.
2. **Creation:** an HR user creates an employee; the stored password is `null` and an invitation email is sent.
3. **No default login:** attempting to log in as that employee with the old default fails.
4. **Activation:** the invitation link permits setting a password once; replaying it fails; using it after 72 hours fails.
5. **Policy:** an 8-character or breached password is rejected at activation.
6. **Population:** `SELECT COUNT(*) FROM patient WHERE password = '<constant>';` returns 0.
7. **CI gate:** adding a test password literal fails the pipeline.

## References

- NIST SP 800-63B §5.1.1.2 — Memorized Secret Verifiers
- OWASP — [Authentication Cheat Sheet: implement secure password recovery and initial credentials](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V2.3 Authenticator Lifecycle Requirements
- CWE-1392 — [Use of Default Credentials](https://cwe.mitre.org/data/definitions/1392.html)
