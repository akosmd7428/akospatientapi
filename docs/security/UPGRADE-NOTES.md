# Upgrade Notes — `security/remediation` branch

Read this before deploying. Several changes are **breaking for API clients** by
design: the defects being fixed were reachable precisely because the old
behaviour was permissive.

---

## 1. New environment variables — the app will not start without these

| Variable | Required | Notes |
|---|---|---|
| `PAYLOAD_ENC_KEY` | **yes** | 64 hex chars. `openssl rand -hex 32`. New key for AES-256-GCM payload encryption ([SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md)). |
| `AES_SECRET_KEY` | **yes** | Must be **rotated** — the old value was a git-committed fallback ([SEC-010](findings/SEC-010-committed-third-party-credentials.md)). |
| `JWT_SECRET` | yes | Already set. Minimum 32 chars, now asserted at boot. |
| `DB_PASSWORD1` | **yes** | Minimum 8 chars. An empty password is now rejected ([SEC-030](findings/SEC-030-database-root-empty-password.md)). |
| `BITLY_ACCESS_TOKEN` | if Bitly is used | Must be **rotated** — the old token was in source. |
| `EMAIL_TOKEN_SECRET` | optional | Derived from `JWT_SECRET` if unset. Set it explicitly in production. |
| `TRUST_PROXY_HOPS` | optional | Defaults to 1. Must equal the number of proxies in front of the app ([SEC-020](findings/SEC-020-trust-proxy-and-xff-spoofing.md)). |
| `CHROME_PATH` | optional | Was hardcoded to `/usr/bin/google-chrome`. Unset uses Puppeteer's bundled Chromium. |
| `LOG_RETENTION_DAYS` | optional | Defaults to 90. |
| `DB_SSL` | optional | `true` enables TLS to MySQL. |

`config/validateEnv.js` refuses to start on a missing, undersized or
**known-compromised** credential — the SHA-256 of each rotated-out value is in
`REVOKED_SECRET_HASHES`, so a stale deployment cannot quietly reuse one.

---

## 2. Database migration required

Four new tables. `sequelize.sync()` no longer runs at boot ([SEC-030](findings/SEC-030-database-root-empty-password.md)), so create them
as a deliberate deploy step:

| Table | Purpose |
|---|---|
| `refresh_tokens` | Revocable sessions ([SEC-017](findings/SEC-017-jwt-hardening-gaps.md)) |
| `password_resets` | Binds OTP verification to the password change ([SEC-002](findings/SEC-002-unauthenticated-password-reset.md)) |
| `otp_requests` | Durable, hashed, attempt-capped OTPs ([SEC-021](findings/SEC-021-insufficient-anti-automation.md)) |
| `impersonation_logs` | Audit trail for support impersonation ([SEC-012](findings/SEC-012-patient-impersonation-endpoint.md)) |

Also: `logs` needs a `createdAt DATETIME NULL` column ([SEC-016](findings/SEC-016-credentials-and-phi-in-logs.md)).

```sql
ALTER TABLE logs ADD COLUMN createdAt DATETIME NULL;
```

A one-off `sequelizeDB1.sync()` in a maintenance script will create the four new
tables; do not re-enable it in `index.js`.

---

## 3. Breaking API changes

### 3.1 Payload encryption wire format

Responses and requests now carry a **third field, `tag`**, and a per-message `IV`:

```jsonc
// before
{ "encryptedData": "…", "IV": "…" }
// now
{ "encryptedData": "…", "IV": "…", "tag": "…" }
```

Clients must send and expect `tag`, and must use the **new** `PAYLOAD_ENC_KEY`.
This is a flag-day change; plan a dual-accept window if a simultaneous cutover is
not feasible.

### 3.2 Headers no longer read

`role` and `companyId` are removed from the CORS allow-list and are no longer
read for any authorization decision ([SEC-001](findings/SEC-001-broken-role-enforcement.md), [SEC-009](findings/SEC-009-tenant-isolation-via-client-header.md)). Tenant scope now comes
from `companyIds` inside the token.

**Exception:** `POST /api/auth/login` still reads a `role` header to choose which
table to check. That is a pre-authentication selector, not authorization — the
password must still match and the token's role is set server-side.

### 3.3 Session model

- Access tokens now expire in **15 minutes** (was 24 hours).
- Login returns `refreshToken` alongside `token`.
- New endpoints: `POST /api/auth/refresh`, `/logout`, `/logout-all`.
- Clients must refresh on 401 rather than treating the token as long-lived.

### 3.4 Password reset now has three steps

`send-otp` → `verify-otp` (**returns `resetToken`**) → `change-password`
(**requires `resetToken`**). Minimum password length is now 12.

### 3.5 Endpoints removed or renamed

| Was | Now |
|---|---|
| `POST /api/auth/encrypt` | **removed** ([SEC-005](findings/SEC-005-public-crypto-oracle-endpoints.md)) |
| `POST /api/auth/decrypt` | **removed** |
| `GET /api/auth/getquery` | **removed** |
| `POST /api/forgot-password/change_password` | **removed** (duplicate) |
| `POST /api/careNavigator/login` | `POST /api/careNavigator/impersonate`, now requires `reason` ([SEC-012](findings/SEC-012-patient-impersonation-endpoint.md)) |
| `GET /api/prescription?token=<email>` | takes the subject from the session; staff pass `?patientId=` |

### 3.6 Routes that now require authentication

All 8 chat endpoints, prescription read/write, both OpenTok endpoints,
`PUT /api/labs/order`, `GET /api/labs/list/:patientId`, the Redcliff routes,
`GET /api/patient/details/:email`, and **`/assets/*`**.

The Redcliff **callbacks** (`redCliffReport`, `fetchRedcliffReport`) use the
existing `x-sync-api-key` shared secret, so the provider must be configured with
it.

### 3.7 Socket.IO requires a token

```js
const socket = io(URL, { auth: { token: accessToken } });
```
Connections without a valid token are refused ([SEC-007](findings/SEC-007-socketio-no-authentication.md)).

### 3.8 Other limits

- Request bodies capped at **256 KB** (was 50 MB). The upload route needs its own
  larger limit wired up if base64 uploads exceed this.
- Uploads: JPEG/PNG/WebP/PDF only, 10 MB max, magic bytes must match ([SEC-014](findings/SEC-014-unrestricted-file-upload.md)).
- `localhost` origins are rejected when `NODE_ENV=production`.
- Rate limits: 300/15min globally, 10/15min on auth, 5/hour on OTP issuance.

---

## 4. Still outstanding — these need a human

Code changes cannot cover these. They are tracked in
[REMEDIATION-ROADMAP.md](REMEDIATION-ROADMAP.md) under *Non-code actions*.

1. **Rotate every credential** in the [SEC-032](findings/SEC-032-secret-sprawl-working-tree.md) inventory. `AES_SECRET_KEY` and the
   Bitly token are in git history and are compromised regardless of this branch.
2. **Scrub git history.** PHI (568 files) and two keys are still in history — this
   branch only untracked them going forward. One coordinated `git filter-repo`
   pass, after rotation, with every clone holder notified.
3. **Confirm repository visibility.** If public, treat as an active disclosure.
4. **Create a least-privilege MySQL user.** The app still connects as `root`;
   `validateEnv` warns outside production and **fails** in production, so this
   must be done before deploying with `NODE_ENV=production`.
5. **Purge the existing `logs` table** — it holds historical credentials and PHI.
   Rotate every SSO `client_secret` that has passed through it.
6. **Reset accounts still holding the old default password** ([SEC-035](findings/SEC-035-hardcoded-default-password.md)).
7. **Rate limiters are per-process.** Behind more than one instance, set up
   `rate-limit-redis` or limits are multiplied by the instance count.

---

## 5. Verification before deploy

```bash
npm ci
npm run security          # static guardrails + npm audit --audit-level=high
npm start                 # must fail fast if any required secret is missing
```

Then, against a staging environment:

- Unauthenticated sweep of the endpoints in §3.6 — all must return 401.
- Patient token against HR and care-navigator routes — all must return 403.
- `companyId` / `role` headers — must have no effect on results.
- Anonymous Socket.IO connection — must be refused.
- Injection probes on the 18 sinks in [SEC-006](findings/SEC-006-sql-injection.md) — no SQL errors, no extra rows.
- Legacy MD5 login — must succeed once and silently upgrade to bcrypt.
- `SELECT COUNT(*) FROM patient WHERE password REGEXP '^[a-f0-9]{32}$';` should
  trend to zero as users log in.

Each finding document's **Verification** section is the acceptance criteria for
that fix.
