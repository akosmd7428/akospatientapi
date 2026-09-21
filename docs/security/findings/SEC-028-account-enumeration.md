# SEC-028 — Account and role enumeration through distinguishable responses

| Field | Value |
|---|---|
| Severity | **Medium** |
| CVSS v3.1 | 5.3 (`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`) |
| OWASP Top 10 2021 | A07:2021 – Identification and Authentication Failures |
| OWASP ASVS 4.0.3 | V2.2.4 – Resistance to account enumeration; V2.5.1 – Reset does not reveal the current password or account status |
| CWE | CWE-204 – Observable Response Discrepancy; CWE-203 – Observable Discrepancy |
| Status | Open |
| Affected component | `services/forgotPasswordService.js`, `controllers/patientController.js`, `controllers/careNavigatorController.js`, `controllers/forgotPasswordController.js` |

## Summary

Several unauthenticated endpoints return different responses depending on whether an email address is registered, and on what *kind* of account it belongs to. An attacker can therefore compile a list of valid accounts and classify each as patient, care navigator, dependent or HR — without any credentials.

The most useful oracle is `GET /api/patient/details/:patientEmail`, which is unauthenticated ([SEC-008](SEC-008-unauthenticated-sensitive-routes.md)) and distinguishes a care navigator from a patient from a non-user in a single request.

The login endpoint itself is handled **correctly** — both failure paths return the same generic message — which shows the pattern was understood and simply not applied to the recovery and lookup paths.

## Affected code

`services/forgotPasswordService.js` — role-specific messages, surfaced verbatim by `controllers/forgotPasswordController.js:12` (`error.message`):

```
:34    "No Patient found with this email"
:44    "No Care Navigator found with this email"
:54    "No Dependent found with this email"
:68    "No User found with this email"
:108   "This email is not registered with us"
:124   "This email is not registered with us"
```

`controllers/patientController.js:235-237` — on the **unauthenticated** `/api/patient/details/:patientEmail`:

```js
// :235
"You are not authorized to logged In."        // → the address is a care navigator
// :237
"No user found with the provided email."      // → the address is not registered
// success                                     → the address is a patient
```

Three distinguishable outcomes from one anonymous GET.

`controllers/careNavigatorController.js:394` — `throw new Error("Invalid Patient Id")` versus a success response, making the impersonation endpoint a patient-id existence oracle ([SEC-012](SEC-012-patient-impersonation-endpoint.md)).

**Correct by contrast** — `services/authService.js:43,50`:

```js
if (!user)            { throw new Error('Invalid email or password'); }
if (!passwordMatch)   { throw new Error('Invalid email or password'); }
```

`:53-56` also returns the same generic message for a deactivated care navigator, which is right.

## Technical detail

Enumeration is rarely the objective; it is the reconnaissance step that makes other attacks efficient. Concretely, in this application:

- **[SEC-002](SEC-002-unauthenticated-password-reset.md)** — unauthenticated password reset needs only a valid email address. Enumeration supplies the target list, and role classification lets the attacker prioritise care navigator and HR accounts, which hold broader access.
- **[SEC-021](SEC-021-insufficient-anti-automation.md)** — credential stuffing against a verified account list is far more efficient than against a speculative one.
- **[SEC-035](SEC-035-hardcoded-default-password.md)** — knowing which addresses are HR-created employee accounts identifies exactly where the default password `Akos…` is likely to still apply.

**Response bodies are not the only channel.** Timing also discriminates: an existing account runs an MD5 comparison and additional queries; a non-existent one returns immediately. Fixing the messages without equalising the work leaves the oracle open to a patient attacker.

**The tension with usability is real but resolvable.** Product teams often object that a generic "if this address is registered, you will receive an email" is worse UX. The resolution is to move the signal out of band: the *email* tells the user whether they have an account; the *HTTP response* does not. An address with no account receives a "someone requested a reset but you have no account" message, which is also a useful security notification.

## Exploit scenario

1. Attacker obtains a candidate list — a company directory, a breach corpus, or generated `firstname.lastname@company.com` patterns.
2. For each address, `GET /api/patient/details/<email>` — unauthenticated, no rate limit of consequence ([SEC-020](SEC-020-trust-proxy-and-xff-spoofing.md)).
3. Responses classify each address: registered patient, care navigator, or unknown.
4. Attacker refines using `POST /api/forgot-password/send-otp`, whose messages further separate patient, dependent, care navigator and HR.
5. Attacker now holds a verified account list with roles. They target the care navigator and HR accounts first via [SEC-002](SEC-002-unauthenticated-password-reset.md), taking over the highest-privilege accounts with a single request each.
6. Independently, the account list itself is disclosure: knowing that a specific person holds an account on a healthcare platform is sensitive information, regardless of what the account contains.

## Impact

- **Confidentiality:** a verified list of users, with roles. Membership in a patient portal is itself health-related information — under GDPR and comparable regimes, the fact that someone is a patient is special-category data.
- **Attack efficiency:** converts speculative attacks into targeted ones and makes the takeover path in SEC-002 practical.
- **Compliance:** ASVS V2.2.4 requires resistance to enumeration.
- Rated Medium: it discloses no PHI directly, but it is the reconnaissance step for two Critical findings.

## Remediation

**Step 1 — one generic message on every recovery path.**

```js
// services/forgotPasswordService.js
static async sendOtp(email) {
    const account = await findAnyAccountByEmail(email);   // patient | careNavigator | dependent | hr | null

    if (account) {
        const otp = await issueOtp(email);                // see SEC-018 / SEC-021
        await sendOtpEmail(email, otp);
    } else {
        await sendNoAccountEmail(email);                  // out-of-band signal, not in the HTTP response
    }

    // Identical response in both cases.
    return messages.otpSentIfRegistered;   // "If this email is registered, an OTP has been sent."
}
```

**Step 2 — remove the role from the message.** Never reveal *which kind* of account exists. The role distinction is an internal detail with no legitimate place in an unauthenticated response.

**Step 3 — authenticate the lookup endpoint.** `GET /api/patient/details/:patientEmail` should require authentication and an authorization check ([SEC-008](SEC-008-unauthenticated-sensitive-routes.md), [SEC-011](SEC-011-bola-idor-across-endpoints.md)). If a pre-authentication existence check is genuinely required by a client flow, redesign the flow — that requirement is what produced this oracle.

**Step 4 — equalise timing.** Perform comparable work on both branches so response time does not discriminate:

```js
const user = await Patient.scope('withPassword').findOne({ where: { email } });

// Always run the KDF — against a dummy hash when the account does not exist.
const stored = user ? user.password : DUMMY_BCRYPT_HASH;
const { ok } = await verifyPassword(password, stored);

if (!user || !ok) throw new AppError('Invalid email or password', 401);
```

`DUMMY_BCRYPT_HASH` is a fixed bcrypt hash of a random string, generated once at startup — it makes the non-existent-account path cost the same as the existing-account path.

**Step 5 — apply the same treatment to authorization failures.** "Not found" and "not permitted" must be indistinguishable in body, status and timing ([SEC-011](SEC-011-bola-idor-across-endpoints.md)), otherwise 403-versus-404 becomes a new enumeration channel.

**Step 6 — rate-limit and monitor.** Per-IP limits on the lookup and recovery endpoints ([SEC-021](SEC-021-insufficient-anti-automation.md)), plus an alert on a high volume of distinct-email lookups from one source — the signature of an enumeration sweep.

**Step 7 — fix the impersonation oracle.** `careNavigatorController.js:394` must return the same 403 for a non-existent patient id as for an unauthorised one ([SEC-012](SEC-012-patient-impersonation-endpoint.md)).

## Verification

1. **Message parity:** `send-otp` with a registered and an unregistered address must return byte-identical responses.
2. **Role parity:** repeat for patient, care navigator, dependent and HR addresses — all four responses identical.
3. **Lookup:** `GET /api/patient/details/<email>` returns 401 without a token, regardless of the address.
4. **Timing:** measure 100 login attempts for existing versus non-existent accounts; the distributions must overlap. A consistent gap indicates the dummy-hash step is missing.
5. **403/404 parity:** confirm authorization failures and missing objects are indistinguishable.
6. **Out-of-band:** confirm an unregistered address still receives the "no account" email, so legitimate users are not left confused.
7. **Monitoring:** confirm an enumeration sweep raises an alert.

## References

- OWASP — [Authentication Cheat Sheet: authentication and error messages](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages)
- OWASP — [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V2.2 General Authenticator Requirements
- CWE-204 — [Observable Response Discrepancy](https://cwe.mitre.org/data/definitions/204.html)
