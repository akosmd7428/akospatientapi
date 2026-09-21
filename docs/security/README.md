# Security Review — `patientportalapi`

**Application:** AKOS MD Patient Portal API (`https://patientportalapi.akosmd.in`)
**Review date:** 21 September 2026
**Method:** Manual source code review, read-only. No exploitation against any live host.
**Standard:** OWASP Top 10 2021 + OWASP ASVS 4.0.3, with CWE identifiers and CVSS v3.1 vectors.
**Findings:** 35 — 10 Critical, 13 High, 9 Medium, 3 Low.

---

## Scope and limitations

**Reviewed:** `index.js`, 22 routers, 23 controllers, 25 services, 8 middlewares, `config/`, `helpers/`, `models/`, `validation/`, `package.json` and `package-lock.json`, and the git repository metadata.

**Not reviewed — findings are assessed at the application layer only:**

- Infrastructure: WAF, TLS termination, network ACLs, security groups, host hardening.
- Database server configuration beyond what the application's own connection settings reveal.
- The frontend applications that consume this API.
- Runtime behaviour — nothing was executed or exploited.

Where an infrastructure control might already mitigate a finding (for example a WAF in front of the SQL injection in [SEC-006](findings/SEC-006-sql-injection.md)), that could not be verified. **Record any such compensating control during triage** and adjust the residual risk accordingly. Severities here assume none.

All secret values in these documents are redacted to the first four characters plus length, so this document set is safe to circulate internally.

---

## The four root causes

Thirty-five findings, but four underlying causes explain most of them. Fixing symptoms one at a time will take far longer than addressing these directly.

### 1. Identity is taken from the request, not from the token

The `role` header, the `companyId` header and body-supplied `patientId` values are all trusted as though they were authenticated facts. The JWT carries a truthful role, and nothing reads it for an authorization decision.

→ [SEC-001](findings/SEC-001-broken-role-enforcement.md), [SEC-009](findings/SEC-009-tenant-isolation-via-client-header.md), [SEC-011](findings/SEC-011-bola-idor-across-endpoints.md), [SEC-012](findings/SEC-012-patient-impersonation-endpoint.md), [SEC-013](findings/SEC-013-mass-assignment.md); also the reachability of [SEC-006](findings/SEC-006-sql-injection.md).

### 2. The cryptography is decorative

A hardcoded key and a fixed IV, committed to git, with no MAC — plus public endpoints that encrypt and decrypt arbitrary data on request. Meanwhile the same PHI is stored unencrypted at rest and written in plaintext to a database log table. Considerable effort went into the control that does not work; none into the one that would.

→ [SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md), [SEC-005](findings/SEC-005-public-crypto-oracle-endpoints.md), [SEC-010](findings/SEC-010-committed-third-party-credentials.md), [SEC-024](findings/SEC-024-phi-unencrypted-at-rest.md), [SEC-029](findings/SEC-029-decryption-middleware-defects.md).

**This is why so many endpoints are unauthenticated.** The payload-encryption layer appears to have been treated as an access control. It is not one, and [SEC-008](findings/SEC-008-unauthenticated-sensitive-routes.md) is the consequence.

### 3. Socket.IO is an unguarded parallel API

It bypasses the encryption middleware, the route logger, the rate limiter and every authentication middleware — while calling the same service layer. 330 lines of business logic sit in the bootstrap file, which is likely why this surface was never reviewed alongside the routers.

→ [SEC-007](findings/SEC-007-socketio-no-authentication.md), and a second unauthenticated path into [SEC-006](findings/SEC-006-sql-injection.md).

### 4. Controls exist but are inconsistently applied or silently dead

Joi schemas imported under the wrong name resolve to `undefined`; `bcrypt` is installed but never called on the login path; `morgan` is installed but never wired up; the error handler never sends a response; `jwtAuth` is present on one route and absent from its sibling. The codebase demonstrates the correct pattern in several places and then does not apply it.

→ [SEC-013](findings/SEC-013-mass-assignment.md), [SEC-019](findings/SEC-019-missing-security-headers.md), [SEC-026](findings/SEC-026-broken-error-handler.md), [SEC-027](findings/SEC-027-broken-and-missing-validation.md), [SEC-003](findings/SEC-003-unsalted-md5-passwords.md).

---

## Fix this week

Five changes, ordered. The first four are small; together they close the paths that require no authentication at all.

| # | Action | Finding | Effort |
|---|---|---|---|
| 1 | Delete `/api/auth/encrypt`, `/decrypt`, `/getquery` | [SEC-005](findings/SEC-005-public-crypto-oracle-endpoints.md) | 3 lines |
| 2 | Require a reset token on `/change-password` | [SEC-002](findings/SEC-002-unauthenticated-password-reset.md) | Half a day |
| 3 | Add authentication to chat, prescription, OpenTok and lab routes | [SEC-008](findings/SEC-008-unauthenticated-sensitive-routes.md) | Half a day |
| 4 | Rotate the Bitly token and `AES_SECRET_KEY` (both in git history) | [SEC-010](findings/SEC-010-committed-third-party-credentials.md) | Hours |
| 5 | Parameterise the `companyId` header in 11 raw queries | [SEC-006](findings/SEC-006-sql-injection.md) | 1–2 days |

Full sequencing, including dependencies between fixes, is in **[REMEDIATION-ROADMAP.md](REMEDIATION-ROADMAP.md)**.

⚠️ **Ordering matters for the cryptography.** Rotating the key ([SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md)) accomplishes nothing while the oracle endpoints ([SEC-005](findings/SEC-005-public-crypto-oracle-endpoints.md)) remain. Delete the endpoints first, or in the same change.

---

## All findings

### Critical (10)

| ID | Title | CVSS | OWASP | CWE |
|---|---|---|---|---|
| [SEC-001](findings/SEC-001-broken-role-enforcement.md) | Role enforcement is a no-op — all three auth middlewares identical | 9.1 | A01 | CWE-863 |
| [SEC-002](findings/SEC-002-unauthenticated-password-reset.md) | Password reset requires neither authentication nor OTP | 9.8 | A07 | CWE-640 |
| [SEC-003](findings/SEC-003-unsalted-md5-passwords.md) | Passwords stored and compared as unsalted MD5 | 9.1 | A02 | CWE-916 |
| [SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md) | Hardcoded AES key and fixed IV, committed to git | 9.1 | A02 | CWE-798, CWE-329 |
| [SEC-005](findings/SEC-005-public-crypto-oracle-endpoints.md) | Unauthenticated encryption and decryption oracle endpoints | 9.1 | A01, A02 | CWE-200 |
| [SEC-006](findings/SEC-006-sql-injection.md) | SQL injection via `companyId` header and `Sequelize.literal()` | 9.8 | A03 | CWE-89 |
| [SEC-007](findings/SEC-007-socketio-no-authentication.md) | Socket.IO accepts unauthenticated connections | 9.1 | A01 | CWE-306 |
| [SEC-008](findings/SEC-008-unauthenticated-sensitive-routes.md) | Sensitive REST endpoints exposed without authentication | 9.1 | A01 | CWE-306 |
| [SEC-009](findings/SEC-009-tenant-isolation-via-client-header.md) | Tenant isolation depends on a client-supplied header | 8.8 | A01 | CWE-639 |
| [SEC-010](findings/SEC-010-committed-third-party-credentials.md) | Live credentials hardcoded in git-tracked source | 8.6 | A02, A05 | CWE-798 |

### High (13)

| ID | Title | CVSS | OWASP | CWE |
|---|---|---|---|---|
| [SEC-011](findings/SEC-011-bola-idor-across-endpoints.md) | Broken object-level authorization across 15+ endpoints | 8.1 | A01 | CWE-639 |
| [SEC-012](findings/SEC-012-patient-impersonation-endpoint.md) | Impersonation endpoint mints a token for any `patientId` | 8.1 | A01 | CWE-863 |
| [SEC-013](findings/SEC-013-mass-assignment.md) | Mass assignment: whole request bodies written to models | 8.1 | A08, A04 | CWE-915 |
| [SEC-014](findings/SEC-014-unrestricted-file-upload.md) | Unrestricted upload: path traversal and stored XSS | 8.3 | A03, A01 | CWE-434, CWE-22 |
| [SEC-015](findings/SEC-015-html-injection-puppeteer-pdf.md) | HTML injection into a sandbox-disabled Puppeteer renderer | 8.6 | A03, A10 | CWE-79, CWE-918 |
| [SEC-016](findings/SEC-016-credentials-and-phi-in-logs.md) | Credentials and PHI written to stdout and the database | 7.5 | A09, A02 | CWE-532 |
| [SEC-017](findings/SEC-017-jwt-hardening-gaps.md) | JWT unhardened; no revocation, logout or refresh | 7.5 | A02, A07 | CWE-347, CWE-613 |
| [SEC-018](findings/SEC-018-insecure-randomness.md) | `Math.random()` for OTPs and identifiers (16 sites) | 7.4 | A02 | CWE-338 |
| [SEC-019](findings/SEC-019-missing-security-headers.md) | No security headers, no HTTPS enforcement, no access log | 7.4 | A05 | CWE-693 |
| [SEC-020](findings/SEC-020-trust-proxy-and-xff-spoofing.md) | `trust proxy` unset; `X-Forwarded-For` trusted | 7.5 | A05, A07 | CWE-348 |
| [SEC-021](findings/SEC-021-insufficient-anti-automation.md) | Insufficient anti-automation on auth and OTP endpoints | 7.5 | A07 | CWE-307 |
| [SEC-022](findings/SEC-022-vulnerable-dependencies.md) | Vulnerable and deprecated dependencies, incl. squatted `crypto` | 7.5 | A06 | CWE-1104 |
| [SEC-023](findings/SEC-023-unauthenticated-static-phi.md) | Patient documents served unauthenticated, and committed to git | 7.5 | A01 | CWE-552 |

### Medium (9)

| ID | Title | CVSS | OWASP | CWE |
|---|---|---|---|---|
| [SEC-024](findings/SEC-024-phi-unencrypted-at-rest.md) | PHI unencrypted at rest, no retention policy | 6.5 | A02 | CWE-311 |
| [SEC-025](findings/SEC-025-verbose-error-disclosure.md) | Raw exception messages returned to clients | 5.3 | A05 | CWE-209 |
| [SEC-026](findings/SEC-026-broken-error-handler.md) | Error handler never responds; mounted unreachably | 5.3 | A05 | CWE-755 |
| [SEC-027](findings/SEC-027-broken-and-missing-validation.md) | Validation absent, or silently broken by bad imports | 6.5 | A04, A03 | CWE-20 |
| [SEC-028](findings/SEC-028-account-enumeration.md) | Account and role enumeration | 5.3 | A07 | CWE-204 |
| [SEC-029](findings/SEC-029-decryption-middleware-defects.md) | Decryption middleware: implicit global, padding oracle | 6.5 | A04, A02 | CWE-1188 |
| [SEC-030](findings/SEC-030-database-root-empty-password.md) | Database runs as `root` with an empty password | 6.8 | A05 | CWE-250 |
| [SEC-031](findings/SEC-031-cors-and-payload-limits.md) | Localhost origins in production; 50 MB bodies logged | 5.9 | A05 | CWE-942, CWE-400 |
| [SEC-035](findings/SEC-035-hardcoded-default-password.md) | Every HR-created employee account gets the same password | 6.5 | A07, A02 | CWE-1392 |

### Low (3)

| ID | Title | CVSS | OWASP | CWE |
|---|---|---|---|---|
| [SEC-032](findings/SEC-032-secret-sprawl-working-tree.md) | Secret sprawl on disk, incl. a stale production DB credential | 4.4 | A05 | CWE-522 |
| [SEC-033](findings/SEC-033-stale-duplicate-sources.md) | Stale duplicate source files shipped in the repository | 3.7 | A05 | CWE-1188 |
| [SEC-034](findings/SEC-034-outbound-channel-weaknesses.md) | Weak SMTP TLS, email HTML injection, SMS parameter injection | 4.3 | A02, A03 | CWE-326, CWE-88 |

---

## What the codebase already does correctly

Recorded so these are not lost during remediation. Several are the reference implementations the fixes should copy.

- **`middleware/syncApiKeyAuth.js:7-23`** — constant-time comparison with a length pre-check, and it **fails closed** when the key is unset. `routes/migrationRoutes.js` applies it to all four routes. This is the model the other middlewares should follow.
- **`helpers/aesCryptoHelper.js:8`** — a fresh `crypto.randomBytes(16)` IV per call, returned with the ciphertext. Exactly the pattern `config/encryption.js` should adopt ([SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md)).
- **`helpers/commonHelper.js:73-93`** — UUIDv4 built on `crypto.randomBytes(16)` with correct version and variant bits.
- **Most raw queries are parameterised.** `patientFolderService.js`, `dataController.js`, `notificationService.js`, `assessmentService.js`, `patientCareTeamService.js`, `doctorService.js` and `migrationService.js` all use named `replacements` correctly. The convention exists; [SEC-006](findings/SEC-006-sql-injection.md) is eighteen departures from it.
- **`services/authService.js:43,50`** — login returns an identical generic message on both failure paths, correctly avoiding enumeration ([SEC-028](findings/SEC-028-account-enumeration.md)).
- **`controllers/patientFolderController.js:10,23`**, **`patientCareTeamController.js:9,24`**, **`appointmentController.js:47`** — derive the subject from `req.user`, which is the correct pattern for [SEC-011](findings/SEC-011-bola-idor-across-endpoints.md).
- **No dynamic code execution.** No `child_process`, `exec`, `eval` or `new Function` anywhere outside `node_modules`.
- **No deprecated `createCipher`/`createDecipher`** — all call sites use the `…iv` variants.
- **No prototype-pollution sink** — no deep merge of request data into shared objects.
- **No stack traces returned to clients** — `err.stack` is never sent in a response ([SEC-025](findings/SEC-025-verbose-error-disclosure.md) concerns database messages only).
- **No debug or health endpoint exposed.**
- **`config/secret.js` is clean** — tracked in git, but every one of its 33 assignments reads from `process.env`.
- **`sequelize.js:7` sets `logging: false`** — SQL and its bound PHI parameters are not echoed to stdout.
- **`.env` and `.env.save` were never committed**; `package-lock.json` is committed and `node_modules/` is ignored.

---

## Two open questions for the owner

Both affect severity and remediation urgency, and are flagged inside the relevant findings.

1. **Is `github.com/akosmd7428/akospatientapi` public or private?**
   If public: the AES key, the Bitly token and 568 patient documents including 367 prescription PDFs have been world-readable for the life of the repository. Rotation becomes an emergency and a breach-notification assessment is required. See [SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md), [SEC-010](findings/SEC-010-committed-third-party-credentials.md), [SEC-023](findings/SEC-023-unauthenticated-static-phi.md).

2. **Which regulatory regime applies?**
   The codebase suggests UAE and India operation (employer-tenant occupational health, Razorpay, an Indian SMS gateway). These documents map to OWASP and ASVS as requested, with HIPAA references included where the parallel is direct. If HIPAA, UAE Federal Law No. 2/2019, or the India DPDP Act formally applies, a mapping appendix should be added.

---

## Documents in this set

| Document | Purpose |
|---|---|
| **README.md** | This index — scope, root causes, all findings, priorities |
| **[FINDINGS-REGISTER.md](FINDINGS-REGISTER.md)** | Tracking table for triage: owner, target date, status |
| **[REMEDIATION-ROADMAP.md](REMEDIATION-ROADMAP.md)** | Phased fix plan with dependencies between findings |
| **[THREAT-MODEL.md](THREAT-MODEL.md)** | Actors, trust boundaries, data flows, and how the findings chain |
| **findings/SEC-0NN-*.md** | One document per finding: evidence, exploit, impact, fix, verification |

Each finding document follows a fixed structure: severity metadata, affected code with `file:line` evidence, technical detail, exploit scenario, impact, prescriptive remediation with code, and verification steps.

---

## How to use this during triage

1. Read this README and [THREAT-MODEL.md](THREAT-MODEL.md) to understand how the findings compound. Several are individually survivable and jointly not.
2. Work through [REMEDIATION-ROADMAP.md](REMEDIATION-ROADMAP.md) in order — it is sequenced by dependency, not only by severity.
3. Record owners and dates in [FINDINGS-REGISTER.md](FINDINGS-REGISTER.md).
4. Use each finding's **Verification** section as the acceptance criteria for its fix.
5. Reproduce exploit scenarios **only in a non-production environment**.
