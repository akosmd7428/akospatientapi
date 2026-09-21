# SEC-021 — Insufficient anti-automation on authentication and OTP endpoints

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`) |
| OWASP Top 10 2021 | A07:2021 – Identification and Authentication Failures |
| OWASP ASVS 4.0.3 | V2.2.1 – Anti-automation controls on authentication; V11.1.4 – Protection against excessive requests; V2.7.6 – OTP single use and attempt limited |
| CWE | CWE-307 – Improper Restriction of Excessive Authentication Attempts; CWE-799 – Improper Control of Interaction Frequency |
| Status | Open |
| Affected component | `index.js`, `helpers/otpHelper.js`, `services/forgotPasswordService.js`, `services/authService.js` |

## Summary

The only rate limiting in the application is a single global bucket of 1000 requests per 15 minutes applied to `/api`. There is no stricter limit on login, OTP issuance, OTP verification or SSO; no failed-attempt counter; and no account lockout anywhere in the codebase.

That bucket is also ineffective, because `trust proxy` is unset and every request is attributed to the proxy's address ([SEC-020](SEC-020-trust-proxy-and-xff-spoofing.md)).

The OTP mechanism has three further defects: it is **never deleted on successful validation**, so it stays replayable for its full five-minute window; it is stored in a process-local `Map` that neither survives a restart nor works across instances; and that `Map` grows without bound because entries are created before any user-existence check.

## Affected code

`index.js:58-67` — the entire anti-automation posture:

```js
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,                     // the comment above says 100
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', apiLimiter);       // :69  one bucket for the whole API
```

`helpers/otpHelper.js` — the complete implementation:

```js
const otpMap = new Map();                                    // :1  process-local, unbounded
const OTP_EXPIRATION_TIME = 5 * 60 * 1000;

const generateOtp = (email) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();   // :5  see SEC-018
  const expirationTime = Date.now() + OTP_EXPIRATION_TIME;
  otpMap.set(email, { otp, expirationTime });                // :7  plaintext OTP in memory
  return otp;
};

const validateOtp = (email, otp) => {
  const otpData = otpMap.get(email);
  if (!otpData) return false;
  if (Date.now() > otpData.expirationTime) {
    otpMap.delete(email);
    return false;
  }
  return otpData.otp === otp;                                // :20  no delete on success, no attempt count
};
```

`services/forgotPasswordService.js:13` — the OTP is generated **before** the user-existence check at `:28-68`, so `otpMap` is populated for arbitrary attacker-supplied addresses.

`services/authService.js:42-51` — login throws `'Invalid email or password'` on failure and records nothing. There is no `failedAttempts` column, no `lockedUntil`, and no counter anywhere.

## Technical detail

**The global limiter is the wrong shape.** A single threshold applied uniformly cannot distinguish a user paging through their records from an attacker guessing passwords. Authentication endpoints need limits one to two orders of magnitude tighter than read endpoints, and they need to be keyed on the **account** as well as the source address — otherwise a distributed attacker spreads attempts across addresses and never trips a per-IP limit.

**1000 per 15 minutes is not a barrier.** Against MD5-hashed accounts ([SEC-003](SEC-003-unsalted-md5-passwords.md)) and a 6-digit OTP, that is 96,000 attempts per day from a single source, and the limiter does not apply per-source at all ([SEC-020](SEC-020-trust-proxy-and-xff-spoofing.md)).

**OTP not deleted on success.** `validateOtp` returns `true` without removing the entry. The same OTP can be validated repeatedly until it expires. In a correct design, verification is a one-time transition; here it is an idempotent read.

**In-memory storage breaks silently.** Behind two or more Node instances, an OTP issued by instance A is invisible to instance B, so verification fails roughly half the time — a correctness bug that also encourages operators to weaken the flow to compensate. A restart discards every pending OTP.

**Unbounded growth.** Because `generateOtp` runs before validating that the email exists, `POST /api/forgot-password/send-otp` in a loop with random addresses grows `otpMap` indefinitely. Nothing evicts expired entries except a later lookup for the same key, which never comes for a random address. This is a memory-exhaustion vector on an unauthenticated endpoint.

**Email and SMS amplification.** `send-otp` and `resend-otp` dispatch a message per call. Without a per-address limit, an attacker can use the endpoint to flood a victim's inbox or phone, and to consume the organisation's SendGrid and SMS quota at its expense.

**Current relevance.** OTP brute force is presently unnecessary, because [SEC-002](SEC-002-unauthenticated-password-reset.md) allows skipping the OTP entirely. Once that is fixed, these controls become the sole barrier on password reset — so they must be delivered in the same release, not deferred.

## Exploit scenario

**Credential stuffing**

1. Attacker takes a breach corpus of email/password pairs.
2. They submit them to `POST /api/auth/login`. No per-account counter exists, so a given account can be attempted indefinitely; no lockout triggers; the global limiter is shared and unhelpful.
3. Successful matches yield valid 24-hour tokens ([SEC-017](SEC-017-jwt-hardening-gaps.md)). No alert fires, because failed authentications are not logged as security events ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).

**OTP brute force (post-SEC-002-fix)**

4. Attacker triggers `send-otp` for the victim.
5. They submit candidate OTPs to `verify-otp`. With no attempt counter, they may exhaust the 900,000-value space; the only constraint is the five-minute window and the shared global limiter.
6. Once a correct OTP is found, it is not consumed, so it can be reused for the remainder of the window.

**Resource exhaustion and harassment**

7. Attacker loops `send-otp` with random addresses: `otpMap` grows without bound, and the SendGrid/SMS quota is consumed.
8. Targeting one address instead floods the victim with messages.

## Impact

- **Confidentiality:** credential stuffing and OTP brute force lead to account takeover.
- **Availability:** unbounded `otpMap` growth; exhausted email and SMS quotas affecting legitimate delivery; the shared rate-limit bucket permits platform-wide lockout ([SEC-020](SEC-020-trust-proxy-and-xff-spoofing.md)).
- **Financial:** third-party messaging costs incurred by the attacker.
- **Compliance:** NIST SP 800-63B §5.2.2 requires rate limiting on authentication attempts; §5.1.3.2 requires OTP attempt limits and single use.

## Remediation

**Step 1 — layered, purpose-specific limiters backed by a shared store.**

```js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const store = () => new RedisStore({ sendCommand: (...args) => redis.call(...args) });

// Broad safety net, unchanged in spirit but properly keyed (see SEC-020 for trust proxy).
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, store: store() });

// Authentication: strict, keyed on IP AND account.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    store: store(),
    keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
    skipSuccessfulRequests: true,          // only failures count toward the budget
    message: { message: 'Too many attempts. Try again later.' },
});

// OTP issuance: per address, expensive to the business.
const otpIssueLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    store: store(),
    keyGenerator: (req) => String(req.body?.email || '').toLowerCase(),
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/sso-client-login', authLimiter);
app.use('/api/forgot-password/send-otp', otpIssueLimiter);
app.use('/api/forgot-password/resend-otp', otpIssueLimiter);
app.use('/api/forgot-password/verify-otp', authLimiter);
```

A Redis-backed store is required for limits to hold across instances — an in-memory store multiplies every limit by the instance count.

**Step 2 — per-account lockout with exponential backoff.** Rate limiting alone does not stop a distributed attacker; the account must defend itself:

```js
async function recordFailedLogin(email) {
    const key = `login:fail:${email.toLowerCase()}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 3600);

    if (count >= 5) {
        const lockSeconds = Math.min(2 ** (count - 5) * 60, 3600);   // 1m, 2m, 4m … capped at 1h
        await redis.setex(`login:lock:${email.toLowerCase()}`, lockSeconds, '1');
        await auditLog('account_locked', { email, attempts: count });
    }
}
```

Return the **same** generic error whether the account is locked or the password is wrong, so lockout state is not an enumeration oracle ([SEC-028](SEC-028-account-enumeration.md)). Notify the account owner by email on lockout — that is both a control and a detection signal.

**Step 3 — rebuild the OTP store.** Move it out of process memory, hash the value, cap attempts, and delete on success:

```js
const OTP_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;

async function issueOtp(email) {
    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');   // see SEC-018
    await redis.setex(`otp:${email}`, OTP_TTL_SECONDS, JSON.stringify({ hash: sha256(otp), attempts: 0 }));
    return otp;
}

async function validateOtp(email, supplied) {
    const raw = await redis.get(`otp:${email}`);
    if (!raw) return false;

    const rec = JSON.parse(raw);
    if (rec.attempts >= MAX_ATTEMPTS) { await redis.del(`otp:${email}`); return false; }

    rec.attempts += 1;
    await redis.setex(`otp:${email}`, await redis.ttl(`otp:${email}`), JSON.stringify(rec));

    const ok = crypto.timingSafeEqual(Buffer.from(sha256(supplied)), Buffer.from(rec.hash));
    if (ok) await redis.del(`otp:${email}`);       // single use — the current code never deletes
    return ok;
}
```

Redis TTL also solves the unbounded-growth problem: entries expire whether or not they are ever looked up again.

**Step 4 — issue the OTP only after the user-existence check,** so `send-otp` for an unknown address costs nothing. Return an identical generic response either way, to preserve non-enumeration ([SEC-028](SEC-028-account-enumeration.md)).

**Step 5 — log and alert on authentication events** — failures, lockouts and OTP attempt exhaustion — as structured audit records ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)). Detection matters as much as prevention: a control that blocks an attack silently gives no opportunity to respond.

**Step 6 — consider CAPTCHA or proof-of-work** on `send-otp` and on login after the first failure, to raise the cost of distributed automation.

## Verification

1. **Login limit:** 11 failed logins for one account from one address — the 11th must be rejected regardless of correctness.
2. **Distributed test:** attempt the same account from 20 different addresses; the per-account lockout must still engage.
3. **OTP attempts:** submit six wrong OTPs; the sixth must fail even if correct, and the record must be invalidated.
4. **OTP single use:** verify a correct OTP, then replay it. The second attempt must fail.
5. **OTP issuance:** call `send-otp` six times in an hour for one address; the sixth must be rejected.
6. **Cross-instance:** issue an OTP on instance A and verify it on instance B. Must succeed (it currently fails).
7. **Memory:** send 10,000 `send-otp` requests with random addresses and confirm process memory does not grow proportionally.
8. **Enumeration:** confirm the response for a locked account, a wrong password and a non-existent account are identical in body and timing.

## References

- OWASP — [Blocking Brute Force Attacks](https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks)
- OWASP ASVS 4.0.3 — V2.2 General Authenticator Requirements; V11.1 Business Logic Security
- NIST SP 800-63B §5.2.2 — Rate Limiting (Throttling)
- CWE-307 — [Improper Restriction of Excessive Authentication Attempts](https://cwe.mitre.org/data/definitions/307.html)
