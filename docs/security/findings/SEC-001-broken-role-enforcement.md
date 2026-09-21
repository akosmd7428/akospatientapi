# SEC-001 — Role enforcement is a no-op: all three auth middlewares are identical

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 9.1 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A01:2021 – Broken Access Control |
| OWASP ASVS 4.0.3 | V4.1.3 – Principle of least privilege; V4.1.5 – Access controls fail securely; V4.2.2 – Verify enforcement server-side |
| CWE | CWE-863 – Incorrect Authorization; CWE-285 – Improper Authorization |
| Status | Open |
| Affected component | `middleware/jwtAuth.js`, `middleware/jwtAuthHr.js`, `middleware/jwtAuthCareNavigator.js`, `index.js` |

## Summary

The application defines three separate authentication middlewares — `jwtAuth` (patient), `jwtAuthHr` (HR) and `jwtAuthCareNavigator` (care navigator) — and applies them across the routers as though they enforced three different privilege levels. They do not. All three are functionally identical, and none of them asserts that the caller actually holds the required role. The only check performed is that a `role` **request header supplied by the client** matches the `role` **claim inside the client's own token** — a comparison the client controls on both sides.

The practical result is that there is exactly one privilege level in this application: "holds any valid token". Any registered patient can call every HR and care-navigator endpoint by simply sending their own token together with `role: patient`.

## Affected code

`middleware/jwtAuth.js:6-23` — the entire authorization logic:

```js
const jwtAuth = (req, res, next) => {
    const role = req.header('role') || null;                     // :7  client-controlled
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenNotFound });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);           // :14
        req.user = decoded;
        if(role != req.user.role){                               // :16  header vs own claim
            return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenInvalid });
        }
        next();
    } catch (error) {
        res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenInvalid });
    }
};
```

`middleware/jwtAuthHr.js:6-23` and `middleware/jwtAuthCareNavigator.js:6-24` contain the same code. Neither contains the string `'hr'` or `'careNavigator'` anywhere — there is no role literal to compare against.

`middleware/jwtAuthCareNavigator.js:8` goes one step further: it reads the tenant identifier and then discards it without any use.

```js
const careNavCompanyId = req.header('companyId') || null;   // never referenced again
```

`index.js:52` explicitly admits the header into the CORS policy, so browsers are permitted to send it:

```js
allowedHeaders: ['Content-Type', 'Authorization','role','companyId'],
```

Roles are assigned at login in `services/authService.js:59-68`:

```js
if(role == 1){ roleName = "patient"; }
else if(role == 2){ roleName = "careNavigator"; }
else { roleName = "hr"; }
const token = jwt.sign({ id: user.id, email: user.email, role:roleName }, process.env.JWT_SECRET, { expiresIn: '1d' });
```

So the token *does* carry a truthful role claim. Nothing ever reads it for an authorization decision.

## Technical detail

The check `role != req.user.role` compares two values that originate from the same party. An attacker holding a patient token knows their own claim is `"patient"`; they simply send `role: patient` alongside it. The comparison passes, `next()` is called, and the handler executes — regardless of which of the three middlewares is mounted on the route.

The middleware therefore provides authentication (the signature is verified) but **zero authorization**. The three-middleware structure creates a convincing illusion of role separation in the routers: `routes/hrRoutes.js` mounts `jwtAuthHr` on every route, `routes/careNavigatorRoutes.js` mounts `jwtAuthCareNavigator`, and a reviewer scanning the routers would reasonably conclude that privilege separation exists.

Note also the loose `!=` comparison. If `role` is absent the header value is `null`, and a token minted without a `role` claim (see SEC-017 — the email-verification token at `controllers/authController.js:337` is signed with the same secret and carries no role) would have `req.user.role === undefined`. `null != undefined` evaluates to `false` in JavaScript, so **the check passes**. A token that was never intended for API authentication is accepted by every guarded route as long as the client omits the `role` header.

## Exploit scenario

1. Attacker registers as an ordinary patient, or uses any existing patient account, and logs in via `POST /api/auth/login`. They receive a token with `role: "patient"`.
2. Attacker calls an HR-only endpoint, e.g. `GET /api/hr/preemployeelist`, sending:
   ```
   Authorization: Bearer <their own patient token>
   role: patient
   companyId: 7
   ```
3. `jwtAuthHr` verifies the signature, sets `req.user`, compares `"patient" != "patient"` → false, and calls `next()`.
4. The handler at `controllers/hrController.js:107-111` scopes the query by the **header** `companyId` (see SEC-009), not by the token, and returns the full pre-employment health record list for company 7.
5. Attacker iterates `companyId` to enumerate every tenant in the platform.

Variant using the null-comparison flaw: request an email-verification token (`authController.js:337`), then call any guarded route with that token and **no** `role` header. `null != undefined` is false, so the route executes.

## Impact

- **Confidentiality:** complete. Every HR and care-navigator endpoint becomes reachable by any authenticated patient — employee rosters, health risk assessments, cardiac and diabetic risk records, lab results, prescriptions and clinical notes across all tenants.
- **Integrity:** complete for the same surface. HR routes mutate employee status (`hrController.js:248-252`), write prescriptions into patient folders (`hrController.js:494`), and update lab orders (`hrController.js:393`).
- **Availability:** not directly affected.
- **Regulatory:** unauthorised disclosure of health data across tenant boundaries. This is a reportable breach class under HIPAA §164.402 and comparable regimes, and the absence of role enforcement contradicts the access-control safeguard at §164.312(a)(1).

This finding is the force multiplier for [SEC-009](SEC-009-tenant-isolation-via-client-header.md), [SEC-011](SEC-011-bola-idor-across-endpoints.md) and [SEC-012](SEC-012-patient-impersonation-endpoint.md): each of those is individually serious, and SEC-001 removes the only barrier that would have limited them to privileged users.

## Remediation

Delete the three middlewares and replace them with a single factory that asserts the **token claim**, ignoring the header entirely.

```js
// middleware/requireAuth.js
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secret');
const { STATUS_CODE } = require('../config/constant');
const messages = require('../config/language').messages;

const ROLES = Object.freeze({ PATIENT: 'patient', HR: 'hr', CARE_NAVIGATOR: 'careNavigator' });

function requireAuth(...allowedRoles) {
    if (allowedRoles.length === 0) {
        throw new Error('requireAuth() must be given at least one role');   // fail closed at boot
    }
    return (req, res, next) => {
        const header = req.header('Authorization') || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) {
            return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenNotFound });
        }
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET, {
                algorithms: ['HS256'],          // see SEC-017
                issuer: 'patientportalapi',
                audience: 'patientportal',
            });
        } catch (err) {
            return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenInvalid });
        }
        // Authorization: strict comparison against a server-side allow-list.
        if (typeof decoded.role !== 'string' || !allowedRoles.includes(decoded.role)) {
            return res.status(STATUS_CODE.HTTP_403_FORBIDDEN).send({ message: messages.forbidden });
        }
        req.user = { id: decoded.id, email: decoded.email, role: decoded.role, companyId: decoded.companyId };
        next();
    };
}

module.exports = { requireAuth, ROLES };
```

Usage in the routers:

```js
const { requireAuth, ROLES } = require('../middleware/requireAuth');
router.get('/preemployeelist', requireAuth(ROLES.HR), HrController.getPreEmployeeList);
router.get('/patients',        requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.getAllPatients);
router.get('/profile',         requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR), PatientController.getProfile);
```

Supporting changes:

1. Remove `'role'` and `'companyId'` from `allowedHeaders` in `index.js:52`. Nothing should read either header again — see SEC-009 for deriving `companyId` from the token.
2. Add `companyId` to the JWT claims at sign time (`services/authService.js:68,75`) so tenant scope travels inside the signed token.
3. Grep the tree for `req.header('role')` and `req.header('companyId')` and remove every consumer.
4. Add `HTTP_403_FORBIDDEN` to `config/constant.js` if absent — authorization failures must be 403, not 401, so that monitoring can distinguish "not logged in" from "not permitted".

## Verification

1. **Negative test:** with a valid *patient* token, call each HR and care-navigator route with `role: patient`. Every call must return **403**. Before the fix, these return 200.
2. **Null-header test:** call a guarded route with a token lacking a `role` claim and **no** `role` header. Must return 403. Before the fix this returns 200.
3. **Positive test:** with a valid HR token, the HR routes must still return 200 and the patient-only routes must return 403.
4. **Static check:** `grep -rn "req.header('role')" --include=*.js .` returns no results outside `node_modules`.
5. **Regression:** confirm no router still imports `jwtAuthHr` or `jwtAuthCareNavigator` after the files are deleted — a stale import would throw at boot, which is the desired fail-closed behaviour.

## References

- OWASP Top 10 2021 — [A01:2021 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- OWASP ASVS 4.0.3 — V4 Access Control Verification Requirements
- CWE-863 — [Incorrect Authorization](https://cwe.mitre.org/data/definitions/863.html)
- OWASP — [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
