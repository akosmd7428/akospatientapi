# SEC-017 — JWT verification unhardened; no revocation, logout or refresh

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`) |
| OWASP Top 10 2021 | A02:2021 – Cryptographic Failures; A07:2021 – Identification and Authentication Failures |
| OWASP ASVS 4.0.3 | V3.5.3 – Stateless tokens use a digital signature verified with an approved algorithm; V3.3.1 – Logout invalidates the session; V3.3.2 – Re-authentication / short token lifetime; V3.2.1 – New token on authentication |
| CWE | CWE-347 – Improper Verification of Cryptographic Signature; CWE-613 – Insufficient Session Expiration |
| Status | Open |
| Affected component | `middleware/jwtAuth.js`, `jwtAuthHr.js`, `jwtAuthCareNavigator.js`, `middleware/routeLogger.js`, `middleware/errorHandler.js`, `services/authService.js`, `controllers/authController.js` |

## Summary

Every `jwt.verify` call in the codebase passes only the token and the secret. No algorithm is pinned, no issuer or audience is checked, and no token type is distinguished. Tokens are issued with `expiresIn: '1d'` and there is **no logout, no revocation list and no refresh mechanism anywhere** — `grep -riE "logout|refreshToken|blacklist|revoke"` across the repository returns zero results.

A stolen token is therefore valid for a full 24 hours and **remains valid after the user changes their password**. There is no mechanism by which the platform can invalidate a session it knows to be compromised.

An additional token-confusion issue: the email-verification token is signed with the same secret and, because of the flawed role comparison in [SEC-001](SEC-001-broken-role-enforcement.md), is accepted by the API's authentication middleware.

## Affected code

**Six verification sites, all unhardened:**

```
middleware/jwtAuth.js:14                jwt.verify(token, JWT_SECRET)
middleware/jwtAuthHr.js:14              jwt.verify(token, JWT_SECRET)
middleware/jwtAuthCareNavigator.js:15   jwt.verify(token, JWT_SECRET)
middleware/routeLogger.js:13            jwt.verify(token, JWT_SECRET)
middleware/errorHandler.js:18           jwt.verify(token, JWT_SECRET)
controllers/authController.js:383       jwt.verify(token, JWT_SECRET)
```

**Issuance — no `iss`, `aud`, `sub` or `jti`:**

`services/authService.js:68`:
```js
const token = jwt.sign({ id: user.id, email: user.email, role: roleName }, process.env.JWT_SECRET, { expiresIn: '1d' });
```
`services/authService.js:75` (`patientLogin`, used by the impersonation endpoint in [SEC-012](SEC-012-patient-impersonation-endpoint.md)) and `controllers/authController.js:337-341` follow the same pattern.

**Token confusion** — `controllers/authController.js:337` signs an email-verification token with the *same* `JWT_SECRET`, carrying payload `{ patientDEtails }` and no `role`:

```js
const token = jwt.sign({ patientDEtails }, JWT_SECRET, { expiresIn: '1d' });
```

`jwtAuth` will verify it successfully. It currently fails only because of the incidental `role != req.user.role` comparison — and as noted in [SEC-001](SEC-001-broken-role-enforcement.md), `null != undefined` is `false`, so omitting the `role` header makes it **pass**.

**Identity set without the guard** — `middleware/routeLogger.js:11-17` and `middleware/errorHandler.js:16-19` both set `req.user = decoded` without any role check. They run globally, so `req.user` may be populated on routes that have no auth middleware at all.

**Secret source** — `config/secret.js:2` reads `process.env.JWT_SECRET` with no startup validation of presence or length. (The value in `.env` is 64 characters, which is adequate; there is simply no assertion enforcing that.)

## Technical detail

**Algorithm pinning.** `jsonwebtoken@9` rejects `alg: none` by default when a string secret is supplied, so the classic bypass is not directly exploitable today. But the protection is a library default rather than an application decision — a downgrade, a refactor to a `KeyObject`, or a future migration to RS256 reintroduces algorithm-confusion risk. Pinning `algorithms: ['HS256']` costs nothing and removes the dependency on a default.

**No issuer or audience.** Any system that shares `JWT_SECRET` — a sibling service, a staging environment using the same value, a CI fixture — produces tokens this API accepts. `iss` and `aud` are what prevent a token minted for one context being replayed in another.

**No `jti`.** Without a unique token identifier there is nothing to put on a revocation list, which is why revocation does not exist: the design precludes it.

**24-hour expiry with no revocation is the core problem.** Combined with:
- token theft via the stored XSS in [SEC-014](SEC-014-unrestricted-file-upload.md),
- bulk token minting via [SEC-012](SEC-012-patient-impersonation-endpoint.md),
- credentials in logs ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)),

…a compromised session cannot be terminated by any action available to the user or the operator. Changing the password does not help. The only remedy is rotating `JWT_SECRET`, which logs out every user on the platform simultaneously.

**No logout.** The absence of a logout endpoint means "log out" in any client is purely cosmetic — discarding the token locally while it remains valid server-side. On a shared or public device, the token persists in browser storage.

## Exploit scenario

1. Attacker steals a clinician's token via the stored XSS in [SEC-014](SEC-014-unrestricted-file-upload.md) — script on the API origin reads it from browser storage and exfiltrates it.
2. The clinician notices something is wrong and changes their password.
3. The stolen token remains valid. Nothing in the password-change path invalidates it, and there is no revocation list to add it to.
4. Attacker continues to access PHI for the remainder of the 24-hour window.
5. Operations staff are asked to terminate the session and discover the only available lever is rotating `JWT_SECRET`, which forcibly logs out every user of the platform — an outage-level response to a single compromised session.

**Token confusion variant**

6. Attacker triggers the email-verification flow and obtains a verification token.
7. They present it to any guarded API route with **no** `role` header. `jwtAuth` verifies the signature, `req.user.role` is `undefined`, the header is `null`, and `null != undefined` is `false` — the check passes.
8. A token issued for a single-purpose email link is now an API session.

## Impact

- **Confidentiality:** stolen tokens grant 24 hours of PHI access that cannot be revoked.
- **Incident response:** no per-session containment. The only response is a platform-wide logout.
- **Compliance:** HIPAA §164.312(a)(2)(iii) requires automatic logoff; a 24-hour non-revocable token does not satisfy it.
- **Defence in depth:** missing algorithm, issuer and audience validation leaves no margin against a dependency change or a shared-secret mistake.

## Remediation

**Step 1 — harden verification everywhere.** Centralise it so there is exactly one call site:

```js
// helpers/tokenHelper.js
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secret');

const ISSUER = 'patientportalapi';
const AUDIENCE = 'patientportal';

function verifyAccessToken(token) {
    const claims = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],          // pinned, not defaulted
        issuer: ISSUER,
        audience: AUDIENCE,
        clockTolerance: 5,
    });
    if (claims.typ !== 'access') throw new Error('Wrong token type');   // blocks token confusion
    return claims;
}
```

**Step 2 — short-lived access tokens plus refresh tokens.**

```js
const crypto = require('crypto');

async function issueTokenPair(user, roleName, companyIds) {
    const jti = crypto.randomUUID();

    const accessToken = jwt.sign(
        { sub: String(user.id), id: user.id, role: roleName, companyIds, typ: 'access', jti },
        JWT_SECRET,
        { expiresIn: '15m', issuer: ISSUER, audience: AUDIENCE }
    );

    const refreshRaw = crypto.randomBytes(32).toString('hex');
    await RefreshToken.create({
        userId: user.id,
        role: roleName,
        tokenHash: sha256(refreshRaw),              // store the hash, never the token
        jti,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        revokedAt: null,
    });

    return { accessToken, refreshToken: refreshRaw };
}
```

15 minutes bounds the damage from a stolen access token. The refresh token is a database row, so it can be revoked.

**Step 3 — rotate refresh tokens on use, and detect reuse.**

```js
async function refresh(refreshRaw) {
    const row = await RefreshToken.findOne({ where: { tokenHash: sha256(refreshRaw) } });
    if (!row || row.expiresAt < new Date()) throw new UnauthorizedError();

    if (row.revokedAt) {
        // A revoked refresh token was replayed — the family is compromised.
        await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: row.userId, revokedAt: null } });
        await auditLog('refresh_token_reuse_detected', { userId: row.userId });
        throw new UnauthorizedError();
    }

    await row.update({ revokedAt: new Date() });     // single use
    return issueTokenPair(await loadUser(row.userId), row.role);
}
```

Reuse detection is what turns refresh tokens from a convenience into a security control.

**Step 4 — implement logout and global revocation.**

```js
// POST /api/auth/logout
await RefreshToken.update({ revokedAt: new Date() }, { where: { jti: req.user.jti, revokedAt: null } });
await DenyList.add(req.user.jti, req.user.exp);      // covers the ≤15 min access-token remainder

// POST /api/auth/logout-all, and automatically on password change and reset
await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
await DenyList.addUser(userId, Date.now());          // reject access tokens issued before now
```

`requireAuth` consults the deny list (Redis, keyed by `jti`, TTL equal to the token's remaining lifetime — bounded and cheap). Wire `logout-all` into the password-change and reset paths ([SEC-002](SEC-002-unauthenticated-password-reset.md)).

**Step 5 — separate the email-verification token.** Sign it with a different secret (`EMAIL_TOKEN_SECRET`), give it `typ: 'email_verify'`, `aud: 'email-verification'` and a 1-hour expiry. The `typ` check in Step 1 then rejects it at the API boundary regardless of other conditions.

**Step 6 — validate the secret at startup.** Assert `JWT_SECRET` is present and ≥ 32 bytes; refuse to boot otherwise. Never fall back to a literal ([SEC-010](SEC-010-committed-third-party-credentials.md)).

**Step 7 — remove `req.user = decoded` from `routeLogger` and `errorHandler`.** Those middlewares may read the token for correlation, but must not establish identity; only `requireAuth` should set `req.user`.

## Verification

1. **Algorithm:** craft a token with `alg: none` and a valid payload — must be rejected. Repeat with `alg: HS512`.
2. **Issuer/audience:** sign a token with the correct secret but `iss: 'other'` — must be rejected.
3. **Type confusion:** present an email-verification token to an API route, with and without a `role` header. Both must return 401.
4. **Expiry:** confirm access tokens expire in 15 minutes.
5. **Logout:** call logout, then reuse the access token — must be rejected within seconds, not 24 hours.
6. **Password change:** change the password, then use a token issued before the change — must be rejected.
7. **Refresh reuse:** use a refresh token twice; the second attempt must fail **and** revoke the whole family. Confirm an audit record is written.
8. **Static check:** `grep -rn "jwt.verify(" --include=*.js . | grep -v node_modules` shows only `helpers/tokenHelper.js`.

## References

- OWASP — [JSON Web Token for Java Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html) (language-agnostic guidance)
- OWASP ASVS 4.0.3 — V3 Session Management Verification Requirements
- RFC 8725 — [JSON Web Token Best Current Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- CWE-613 — [Insufficient Session Expiration](https://cwe.mitre.org/data/definitions/613.html)
