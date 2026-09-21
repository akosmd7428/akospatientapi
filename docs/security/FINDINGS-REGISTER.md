# Findings Register — `patientportalapi`

Tracking table for remediation triage. **Owner**, **Target date** and **Status** are left blank for the team to fill in.

**Review date:** 21 September 2026 · **Total:** 35 findings — 10 Critical, 13 High, 9 Medium, 3 Low
**Status values:** `Open` · `In progress` · `Fixed` · `Risk accepted` · `Not applicable`

A finding marked `Risk accepted` must record who accepted it, on what date, and on the basis of which compensating control. A finding marked `Not applicable` must record why — for example an infrastructure control verified after this review.

---

## Register

| ID | Title | Sev | CVSS | OWASP | CWE | Primary component | Owner | Target | Status |
|---|---|---|---|---|---|---|---|---|---|
| [SEC-001](findings/SEC-001-broken-role-enforcement.md) | Role enforcement is a no-op | Critical | 9.1 | A01 | CWE-863 | `middleware/jwtAuth*.js` | | | Open |
| [SEC-002](findings/SEC-002-unauthenticated-password-reset.md) | Password reset without auth or OTP | Critical | 9.8 | A07 | CWE-640 | `routes/forgotPasswordRoutes.js:12` | | | Open |
| [SEC-003](findings/SEC-003-unsalted-md5-passwords.md) | Unsalted MD5 password storage | Critical | 9.1 | A02 | CWE-916 | `services/authService.js:46` | | | Open |
| [SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md) | Hardcoded AES key and fixed IV | Critical | 9.1 | A02 | CWE-798 | `config/encryption.js:4-7` | | | Open |
| [SEC-005](findings/SEC-005-public-crypto-oracle-endpoints.md) | Public encrypt/decrypt oracle endpoints | Critical | 9.1 | A01 | CWE-200 | `routes/authRoutes.js:11-13` | | | Open |
| [SEC-006](findings/SEC-006-sql-injection.md) | SQL injection (18 sinks) | Critical | 9.8 | A03 | CWE-89 | `services/chatService.js:39,276` | | | Open |
| [SEC-007](findings/SEC-007-socketio-no-authentication.md) | Socket.IO unauthenticated | Critical | 9.1 | A01 | CWE-306 | `index.js:119-452` | | | Open |
| [SEC-008](findings/SEC-008-unauthenticated-sensitive-routes.md) | Unauthenticated sensitive REST routes | Critical | 9.1 | A01 | CWE-306 | `routes/chatRoutes.js:6-13` | | | Open |
| [SEC-009](findings/SEC-009-tenant-isolation-via-client-header.md) | Tenant isolation via client header | Critical | 8.8 | A01 | CWE-639 | `controllers/hrController.js:107` | | | Open |
| [SEC-010](findings/SEC-010-committed-third-party-credentials.md) | Live credentials in git-tracked source | Critical | 8.6 | A02/A05 | CWE-798 | `helpers/aesCryptoHelper.js:7` | | | Open |
| [SEC-011](findings/SEC-011-bola-idor-across-endpoints.md) | BOLA/IDOR across 15+ endpoints | High | 8.1 | A01 | CWE-639 | `controllers/*` | | | Open |
| [SEC-012](findings/SEC-012-patient-impersonation-endpoint.md) | Patient impersonation endpoint | High | 8.1 | A01 | CWE-863 | `careNavigatorController.js:378` | | | Open |
| [SEC-013](findings/SEC-013-mass-assignment.md) | Mass assignment from request bodies | High | 8.1 | A08 | CWE-915 | `services/labTestService.js:1509` | | | Open |
| [SEC-014](findings/SEC-014-unrestricted-file-upload.md) | Unrestricted upload → traversal, stored XSS | High | 8.3 | A03 | CWE-434 | `services/dataService.js:71-107` | | | Open |
| [SEC-015](findings/SEC-015-html-injection-puppeteer-pdf.md) | HTML injection into `--no-sandbox` Puppeteer | High | 8.6 | A03/A10 | CWE-79 | `helpers/generatePrescription.js` | | | Open |
| [SEC-016](findings/SEC-016-credentials-and-phi-in-logs.md) | Credentials and PHI in logs | High | 7.5 | A09 | CWE-532 | `middleware/routeLogger.js:25` | | | Open |
| [SEC-017](findings/SEC-017-jwt-hardening-gaps.md) | JWT unhardened; no revocation | High | 7.5 | A02/A07 | CWE-347 | `middleware/jwtAuth.js:14` | | | Open |
| [SEC-018](findings/SEC-018-insecure-randomness.md) | `Math.random()` for OTPs and IDs | High | 7.4 | A02 | CWE-338 | `helpers/otpHelper.js:5` | | | Open |
| [SEC-019](findings/SEC-019-missing-security-headers.md) | No security headers or HTTPS enforcement | High | 7.4 | A05 | CWE-693 | `index.js:44-104` | | | Open |
| [SEC-020](findings/SEC-020-trust-proxy-and-xff-spoofing.md) | `trust proxy` unset; XFF trusted | High | 7.5 | A05 | CWE-348 | `helpers/commonHelper.js:109` | | | Open |
| [SEC-021](findings/SEC-021-insufficient-anti-automation.md) | Insufficient anti-automation | High | 7.5 | A07 | CWE-307 | `index.js:58-67` | | | Open |
| [SEC-022](findings/SEC-022-vulnerable-dependencies.md) | Vulnerable/deprecated dependencies | High | 7.5 | A06 | CWE-1104 | `package.json` | | | Open |
| [SEC-023](findings/SEC-023-unauthenticated-static-phi.md) | Unauthenticated PHI documents; PHI in git | High | 7.5 | A01 | CWE-552 | `index.js:101`, `assets/` | | | Open |
| [SEC-024](findings/SEC-024-phi-unencrypted-at-rest.md) | PHI unencrypted at rest | Medium | 6.5 | A02 | CWE-311 | `models/patientModel.js` | | | Open |
| [SEC-025](findings/SEC-025-verbose-error-disclosure.md) | Raw exception messages to clients | Medium | 5.3 | A05 | CWE-209 | `index.js:98` | | | Open |
| [SEC-026](findings/SEC-026-broken-error-handler.md) | Error handler never responds | Medium | 5.3 | A05 | CWE-755 | `middleware/errorHandler.js` | | | Open |
| [SEC-027](findings/SEC-027-broken-and-missing-validation.md) | Validation absent or silently broken | Medium | 6.5 | A04 | CWE-20 | `routes/*`, `validation/*` | | | Open |
| [SEC-028](findings/SEC-028-account-enumeration.md) | Account and role enumeration | Medium | 5.3 | A07 | CWE-204 | `forgotPasswordService.js:34` | | | Open |
| [SEC-029](findings/SEC-029-decryption-middleware-defects.md) | Decryption middleware defects | Medium | 6.5 | A04 | CWE-1188 | `validateDataEncryption.js:8` | | | Open |
| [SEC-030](findings/SEC-030-database-root-empty-password.md) | DB runs as `root`, empty password | Medium | 6.8 | A05 | CWE-250 | `.env:6-7` | | | Open |
| [SEC-031](findings/SEC-031-cors-and-payload-limits.md) | Localhost CORS origins; 50 MB bodies | Medium | 5.9 | A05 | CWE-942 | `index.js:44-53` | | | Open |
| [SEC-032](findings/SEC-032-secret-sprawl-working-tree.md) | Secret sprawl on disk | Low | 4.4 | A05 | CWE-522 | `.env`, `.env.save` | | | Open |
| [SEC-033](findings/SEC-033-stale-duplicate-sources.md) | Stale duplicate source files | Low | 3.7 | A05 | CWE-1188 | `*_555`, `*_222`, `*.save` | | | Open |
| [SEC-034](findings/SEC-034-outbound-channel-weaknesses.md) | SMTP TLS, email and SMS injection | Low | 4.3 | A02/A03 | CWE-326 | `emailHelperSMTP.js:21` | | | Open |
| [SEC-035](findings/SEC-035-hardcoded-default-password.md) | Hardcoded default employee password | Medium | 6.5 | A07 | CWE-1392 | `controllers/hrController.js:269` | | | Open |

---

## By OWASP Top 10 2021 category

| Category | Count | Findings |
|---|---|---|
| A01 – Broken Access Control | 8 | SEC-001, 005, 007, 008, 009, 011, 012, 014, 023 |
| A02 – Cryptographic Failures | 9 | SEC-003, 004, 005, 010, 016, 017, 018, 024, 034, 035 |
| A03 – Injection | 5 | SEC-006, 014, 015, 027, 034 |
| A04 – Insecure Design | 3 | SEC-013, 027, 029 |
| A05 – Security Misconfiguration | 8 | SEC-010, 019, 020, 025, 026, 030, 031, 032, 033 |
| A06 – Vulnerable and Outdated Components | 1 | SEC-022 |
| A07 – Identification and Authentication Failures | 6 | SEC-002, 017, 020, 021, 028, 035 |
| A08 – Software and Data Integrity Failures | 1 | SEC-013 |
| A09 – Security Logging and Monitoring Failures | 1 | SEC-016 |
| A10 – Server-Side Request Forgery | 1 | SEC-015 |

*Counts exceed 35 because several findings map to more than one category; each is listed under every category that applies.*

**A01 and A02 together account for the majority of findings**, which is consistent with the first two root causes in [README.md](README.md): identity taken from the request, and cryptography that does not work.

---

## By component

| Component | Findings |
|---|---|
| `index.js` (bootstrap, Socket.IO, CORS, limits) | SEC-007, 019, 020, 021, 023, 026, 031 |
| `middleware/` | SEC-001, 016, 017, 026, 029 |
| `config/encryption.js`, `helpers/aesCryptoHelper.js` | SEC-004, 010, 029 |
| `routes/` | SEC-005, 008, 027 |
| `controllers/` | SEC-011, 012, 016, 025, 035 |
| `services/` | SEC-006, 013, 014, 018, 028, 034 |
| `helpers/` (PDF, email, SMS, OTP) | SEC-015, 018, 034 |
| `models/` | SEC-024 |
| Dependencies and repository hygiene | SEC-022, 032, 033 |
| Database configuration | SEC-030 |

---

## Fix-effort estimate

Rough sizing to support scheduling. These are engineering estimates for the code change plus its verification, and exclude coordination, release and regression testing.

| Size | Findings | Notes |
|---|---|---|
| **Minutes** | SEC-005, 027 (imports), 033 | Delete routes; fix import names; delete stale files |
| **Hours** | SEC-010, 019, 020, 024 (scope), 025, 026, 029, 031, 032, 034 | Configuration, single-file changes |
| **1–3 days** | SEC-002, 003, 006, 012, 013, 014, 015, 018, 021, 022, 028, 030, 035 | Focused feature work |
| **1–2 weeks** | SEC-001, 007, 008, 009, 011, 016, 017, 023, 024 (encryption) | Cross-cutting; touch many files or require client coordination |

---

## Review log

| Date | Event | By |
|---|---|---|
| 2026-09-21 | Initial review; 35 findings recorded | Security review |
| | Triage meeting — owners and target dates assigned | |
| | P0 hotfix release | |
| | Re-test of P0 findings | |
