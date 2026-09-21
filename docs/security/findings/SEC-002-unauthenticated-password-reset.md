# SEC-002 — Password reset requires neither authentication nor OTP verification

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 9.8 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`) |
| OWASP Top 10 2021 | A07:2021 – Identification and Authentication Failures |
| OWASP ASVS 4.0.3 | V2.5.1 – Reset must not reveal the current password; V2.5.6 – Reset uses a securely generated, single-use, time-limited token; V2.5.7 – Reset token is bound to the verification step |
| CWE | CWE-640 – Weak Password Recovery Mechanism; CWE-306 – Missing Authentication for Critical Function |
| Status | Open |
| Affected component | `routes/forgotPasswordRoutes.js`, `controllers/forgotPasswordController.js`, `services/forgotPasswordService.js`, `helpers/otpHelper.js` |

## Summary

`POST /api/forgot-password/change-password` accepts an email address and a new password and rewrites the account's credential. It requires no authentication token, and — critically — it never checks that the OTP flow was completed for that email. The `sendOtp` and `verifyOtp` endpoints exist and work, but `verifyOtp` is entirely stateless: it returns a boolean to the caller and records nothing. `changePassword` never consults it.

Anyone who knows or guesses a registered email address can take over that account with a single unauthenticated HTTP request. This applies to patient, care navigator and HR accounts alike.

The route immediately below it in the same file registers the *same handler* **with** `jwtAuth`, which strongly suggests the omission on line 12 is an oversight rather than a deliberate design.

## Affected code

`routes/forgotPasswordRoutes.js:10-14` — note the contrast between line 12 and line 14:

```js
router.post('/send-otp',        validateDataEncryption(), validateSchema(sendOtpValidation),       ForgotPasswordController.sendOtp);
router.post('/verify-otp',      validateDataEncryption(), validateSchema(verifyOtpValidation),     ForgotPasswordController.verifyOtp);
router.post('/change-password', validateDataEncryption(), validateSchema(changePasswordValidation),                ForgotPasswordController.changePassword);   // :12  no jwtAuth
router.post('/resend-otp',      validateDataEncryption(), validateSchema(sendOtpValidation),       ForgotPasswordController.sendOtp);
router.post('/change_password', validateDataEncryption(), validateSchema(changePasswordValidation), jwtAuth,       ForgotPasswordController.changePassword);   // :14  jwtAuth present
```

`services/forgotPasswordService.js:80-131` — the handler. There is no OTP argument, no token argument, and no call to `validateOtp`:

```js
static async changePassword(email, newPassword, role) {
    // Create the MD5 hash of the plaintext password
    const hashedPassword = crypto.createHash('md5').update(newPassword).digest('hex');   // :83  see SEC-003
    const uniquePatientId = Math.floor(10000 + Math.random() * 90000);                   // :84  see SEC-018
    const patient = await Patient.findOne({ where: { email } });
    let user;
    if (role == 'hr') {
        const hrData = await Hr.findOne({ where: { email } });
        if (!hrData) { throw new Error("This email is not registered with us"); }
        else { await Hr.update({ password: hashedPassword }, { where: { email } }); }    // :92
        return messages.passwordChanged;
    }
    ...
    await Patient.update({ password: hashedPassword }, { where: { email } });            // :116
    ...
    await CareNavigator.update({ password: hashedPassword }, { where: { email } });      // :110, :126
}
```

`helpers/otpHelper.js:11-21` — `validateOtp` is a pure function over an in-memory map. It returns a boolean and persists no "this email has been verified" state anywhere:

```js
const validateOtp = (email, otp) => {
  const otpData = otpMap.get(email);
  if (!otpData) return false;
  if (Date.now() > otpData.expirationTime) {
    otpMap.delete(email);
    return false;
  }
  return otpData.otp === otp;      // :20  note: no delete on success — see SEC-021
};
```

Even if `changePassword` *did* call `validateOtp`, the design could not bind the two steps: nothing links a successful verification to the subsequent password write.

## Technical detail

A correct reset flow has three properties this one lacks:

1. **A capability is issued on verification.** Successful OTP entry must produce a server-side, single-use, short-lived reset token that is returned to the client and required by the change step. Here, `verifyOtp` returns only a success message (`controllers/forgotPasswordController.js`), and the map entry is left in place.
2. **The change step consumes that capability.** `changePassword` takes only `email`, `newPassword` and `role` — there is no parameter that could carry proof of verification.
3. **State is durable and shared.** `otpMap` is a module-level `Map` in a single Node process. Behind more than one instance or after a restart, verification state is lost entirely — which is presumably part of why the binding was never built.

Because the change step is independent, the OTP mechanism is decorative: it gates nothing. The rate limiting, OTP entropy and expiry weaknesses catalogued in [SEC-018](SEC-018-insecure-randomness.md) and [SEC-021](SEC-021-insufficient-anti-automation.md) are moot for this attack — no attacker needs to defeat the OTP, because no attacker needs to touch it.

Note also `services/forgotPasswordService.js:101-107`: if the email is not an existing `Patient` but exists in `ConnectedCompaniesPatient`, the handler **creates a new Patient account** with the attacker-supplied password. The endpoint is therefore an unauthenticated account-creation primitive as well as a takeover primitive.

## Exploit scenario

1. Attacker obtains a target email address — from the account-enumeration oracles in [SEC-028](SEC-028-account-enumeration.md), a breach corpus, a company directory, or simply an employee's work address.
2. Attacker sends a single request. (The body must be wrapped by the app's payload encryption, whose key is public per [SEC-004](SEC-004-hardcoded-aes-key-static-iv.md), or produced via the oracle in [SEC-005](SEC-005-public-crypto-oracle-endpoints.md) — neither is an obstacle.)
   ```
   POST /api/forgot-password/change-password
   Content-Type: application/json

   { "encryptedData": "<enc({ email: 'victim@company.com', newPassword: 'Attacker#1' })>", "IV": "<iv>" }
   ```
3. Response: `password changed successfully`. No OTP was requested, sent or supplied.
4. Attacker logs in at `POST /api/auth/login` as the victim and receives a 24-hour token.
5. If the victim is a care navigator or HR user, the attacker now holds a privileged account; combined with [SEC-009](SEC-009-tenant-isolation-via-client-header.md) they read every tenant's data. If the victim is a patient, the attacker reads that patient's full clinical record.

The attack leaves the victim locked out, which makes it noisy — but detection depends on the victim reporting it, and nothing in the logs distinguishes a legitimate reset from this one.

## Impact

- **Confidentiality:** total account takeover for any account whose email is known, at any privilege level, without authentication.
- **Integrity:** the attacker can then write to clinical records, prescriptions, lab orders and appointments as the victim.
- **Availability:** the legitimate user is locked out of their account.
- **Regulatory:** unauthorised access to PHI through a defective authentication mechanism. HIPAA §164.312(d) requires person-or-entity authentication; a reset path with no verification step fails it outright.

## Remediation

Introduce a durable, single-use reset token and require it at the change step. Persist it server-side (a `password_resets` table or Redis), never in process memory.

**1. Issue the token on successful verification**

```js
// services/forgotPasswordService.js
const crypto = require('crypto');
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;   // 10 minutes

static async verifyOtp(email, otp, role) {
    if (!validateOtp(email, otp)) {
        await recordFailedAttempt(email);              // see SEC-021
        throw new Error(messages.invalidOtp);
    }
    consumeOtp(email);                                 // delete on success — see SEC-021

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash  = crypto.createHash('sha256').update(resetToken).digest('hex');

    await PasswordReset.destroy({ where: { email } }); // one live token per account
    await PasswordReset.create({
        email,
        role,
        tokenHash,                                     // store the HASH, never the token
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        usedAt: null,
    });
    return { resetToken };                             // returned once, to the verified caller only
}
```

**2. Require and consume it on change**

```js
static async changePassword(email, newPassword, role, resetToken) {
    if (!resetToken) throw new Error(messages.invalidResetToken);

    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Atomically consume: the UPDATE only matches an unused, unexpired row.
    const [affected] = await PasswordReset.update(
        { usedAt: new Date() },
        { where: { email, role, tokenHash, usedAt: null, expiresAt: { [Op.gt]: new Date() } } }
    );
    if (affected !== 1) throw new Error(messages.invalidResetToken);

    const hashedPassword = await bcrypt.hash(newPassword, 12);   // see SEC-003
    await applyPasswordUpdate(email, role, hashedPassword);

    await revokeAllTokensFor(email, role);   // see SEC-017 — invalidate live sessions
    await notifyPasswordChanged(email);      // out-of-band alert to the account owner
    return messages.passwordChanged;
}
```

**3. Supporting changes**

- Add `resetToken: Joi.string().hex().length(64).required()` to `changePasswordValidation`.
- Delete the duplicate `/change_password` route at line 14 — one reset endpoint only.
- Enforce a password policy on `newPassword` (ASVS V2.1: minimum 12 characters, check against a breached-password list).
- Remove the implicit account-creation branch at `forgotPasswordService.js:101-107`. Account creation must not be a side effect of password reset.
- Apply a strict per-account and per-IP rate limit to all three reset endpoints (see SEC-021).
- Log reset issuance and consumption to an audit trail — but never log the token itself (see SEC-016).

## Verification

1. **Primary test:** call `POST /api/forgot-password/change-password` with a valid email and a new password, and **no** prior OTP flow. Must return 400/401. Before the fix it returns 200 and the password is changed.
2. **Replay test:** complete the full flow (`send-otp` → `verify-otp` → `change-password`), then replay the same `resetToken` a second time. The second call must fail.
3. **Expiry test:** hold a valid `resetToken` past the TTL and use it. Must fail.
4. **Cross-account test:** obtain a `resetToken` for account A and submit it with account B's email. Must fail.
5. **Session invalidation:** confirm a token issued to the victim before the reset is rejected afterwards.
6. **Static check:** `grep -n "changePassword" services/forgotPasswordService.js` shows the signature now requires a reset token.

## References

- OWASP Top 10 2021 — [A07:2021 Identification and Authentication Failures](https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/)
- OWASP — [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V2.5 Credential Recovery Requirements
- CWE-640 — [Weak Password Recovery Mechanism for Forgotten Password](https://cwe.mitre.org/data/definitions/640.html)
