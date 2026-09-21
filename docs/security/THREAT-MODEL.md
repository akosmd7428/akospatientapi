# Threat Model — `patientportalapi`

This document exists to explain **why the findings compound**. Read individually, several look like ordinary bugs. Read together, they form short chains in which one unauthenticated request reaches the entire PHI corpus of every tenant.

Companion to [README.md](README.md) and the finding documents in `findings/`.

---

## 1. System overview

A Node.js/Express REST API with a parallel Socket.IO server, backed by MySQL via Sequelize, serving a multi-tenant occupational-health patient portal.

```
                    ┌─────────────────────────────────────────────────┐
  Patients ────────▶│                                                 │
  Care navigators ─▶│   Browser / mobile clients                      │
  HR users ────────▶│                                                 │
                    └───────────────┬─────────────────────────────────┘
                                    │  HTTPS (terminated at a proxy)
                    ════════════════▼═══════════════════  TRUST BOUNDARY 1
                    ┌─────────────────────────────────────────────────┐
                    │  Reverse proxy                                  │
                    └───────────────┬─────────────────────────────────┘
                                    │  HTTP
                    ┌───────────────▼─────────────────────────────────┐
                    │  Express app (index.js)          Socket.IO      │
                    │  ├ cors                          └ NO AUTH      │ ◀── SEC-007
                    │  ├ rateLimit (ineffective)          (bypasses   │
                    │  ├ routeLogger (logs bodies)         all        │
                    │  ├ 22 routers                        middleware)│
                    │  └ /assets static (no auth)                     │ ◀── SEC-023
                    └───┬──────────┬──────────┬──────────┬────────────┘
                        │          │          │          │
        ════════════════▼══════════▼══════════▼══════════▼═══  BOUNDARIES 2–5
                        │          │          │          │
                  ┌─────▼────┐ ┌───▼─────┐ ┌──▼──────┐ ┌─▼─────────────┐
                  │  MySQL   │ │Puppeteer│ │ Local   │ │ Third parties │
                  │  as root │ │--no-    │ │ files   │ │ SendGrid, SMS,│
                  │  empty   │ │sandbox  │ │ assets/ │ │ Razorpay,     │
                  │  password│ │         │ │ .env    │ │ OpenTok, labs │
                  └──────────┘ └─────────┘ └─────────┘ └───────────────┘
```

### Trust boundaries

| # | Boundary | Controls that should exist | Actual state |
|---|---|---|---|
| 1 | Internet → API | TLS, authentication, authorization, rate limiting, input validation | Partial. Many routes unauthenticated ([SEC-008](findings/SEC-008-unauthenticated-sensitive-routes.md)); role checks are a no-op ([SEC-001](findings/SEC-001-broken-role-enforcement.md)); rate limiting ineffective ([SEC-020](findings/SEC-020-trust-proxy-and-xff-spoofing.md)) |
| 1b | Internet → Socket.IO | Handshake authentication, per-event authorization | **None** ([SEC-007](findings/SEC-007-socketio-no-authentication.md)) |
| 2 | API → MySQL | Least-privilege account, parameterised queries, TLS | `root`/empty password ([SEC-030](findings/SEC-030-database-root-empty-password.md)); 18 injectable statements ([SEC-006](findings/SEC-006-sql-injection.md)) |
| 3 | API → Puppeteer | Sandbox, escaped input, no subresource fetching | `--no-sandbox`; 12 unescaped interpolations ([SEC-015](findings/SEC-015-html-injection-puppeteer-pdf.md)) |
| 4 | API → filesystem | Path containment, type allow-list, authorised retrieval | `type` is a client-supplied path segment ([SEC-014](findings/SEC-014-unrestricted-file-upload.md)); `/assets` public ([SEC-023](findings/SEC-023-unauthenticated-static-phi.md)) |
| 5 | API → third parties | Secrets in a vault, encoded parameters | Secrets on disk and in git ([SEC-010](findings/SEC-010-committed-third-party-credentials.md), [SEC-032](findings/SEC-032-secret-sprawl-working-tree.md)); unencoded SMS parameters ([SEC-034](findings/SEC-034-outbound-channel-weaknesses.md)) |

**Boundary 1b is the one most easily missed.** Socket.IO shares the HTTP server and reaches the same services, but traverses none of the Express middleware — not the encryption layer, not the rate limiter, not the route logger, and not any authentication. It is a second front door with no lock, and because its 330 lines of handlers live in `index.js` rather than in the routers, it was not reviewed alongside them.

---

## 2. Assets

| Asset | Sensitivity | Where it lives |
|---|---|---|
| Clinical records — diagnoses, medications, allergies, notes, vitals | **Highest** | `patientDetails`, `patientPrescriptionDetails` |
| Clinician–patient chat transcripts | **Highest** | `chat` table; reachable over the unauthenticated socket |
| Prescription PDFs and lab reports | **Highest** | `assets/` — public, and 402 files committed to git |
| Patient demographics — name, DOB, phone, email, address | High | `patient` table, plaintext |
| Pre-employment health assessments and risk scores | High | Per-tenant; the core product for employer customers |
| Credentials — patient, clinician, HR | High | `patient.password` etc., unsalted MD5 |
| Platform secrets — `JWT_SECRET`, AES keys, third-party API keys | High | `.env` on disk; two also in git |
| Tenant boundary — which employer sees which employees | High | Enforced only by a client-supplied header |
| Teleconsultation sessions | High | OpenTok; tokens mintable without authentication |
| Payment and order state | Medium | `labOrder`; client-settable via mass assignment |
| Audit and log data | Medium | `logs` table — contains PHI and credentials, no retention |

---

## 3. Actors

| Actor | Intended capability | Actual capability |
|---|---|---|
| **Anonymous internet** | Login, register, password reset, public reference data | Read and write chat; read and write prescriptions; mint OpenTok tokens; reset any password; SQL injection; read every patient document; full Socket.IO access |
| **Patient** | Own record only | Any patient's record; all HR and care-navigator endpoints; any tenant's data; mint a session token for any patient |
| **Care navigator** | Assigned patients within their company | Every tenant's data; impersonate any patient with no audit record |
| **HR user** | Their company's employees | Every tenant's employees, by changing one header |
| **Insider with log access** | Diagnostics | Plaintext passwords, SSO client secrets, PHI |
| **Anyone with repo access** | Source code | AES keys, a live Bitly token, 402 prescription and report files |
| **Third-party integrations** | Scoped API access | Several integration endpoints are unauthenticated |

The gap between the two columns is the finding set. Note that **"Patient" and "Anonymous" have nearly the same effective capability** — which is the clearest statement of the access-control problem.

---

## 4. How the findings chain

Individually, several findings are ordinary. These four chains are why the aggregate risk is severe.

### Chain A — Anonymous to full database (no credentials at any step)

```
SEC-004  AES key is committed to git
   +
SEC-005  Public /api/auth/encrypt mints valid ciphertext on demand
   ↓
SEC-008  Chat routes carry no authentication
   ↓
SEC-006  companyId header interpolated into raw SQL
   ↓
SEC-030  Connection is root with FILE privilege
   ↓
SEC-032  LOAD_FILE('.env') → JWT_SECRET
   ↓
         Forge a token for any user and role. Every access-control
         fix elsewhere is now irrelevant.
```

**Why it works:** the payload-encryption layer was treated as an access control, so the chat routes were left unauthenticated. Neither assumption holds.
**Cheapest break:** delete the oracle endpoints ([SEC-005](findings/SEC-005-public-crypto-oracle-endpoints.md), three lines) — or parameterise the queries ([SEC-006](findings/SEC-006-sql-injection.md)), which removes the chain at its centre.

### Chain B — One request to account takeover

```
SEC-028  Enumerate addresses and classify them by role
   ↓
SEC-002  POST /change-password with {email, newPassword} — no OTP, no auth
   ↓
SEC-003  Password stored as unsalted MD5
   ↓
SEC-001  Role middleware enforces nothing
   ↓
SEC-009  companyId header selects any tenant
   ↓
         Every tenant's PHI, from one unauthenticated request.
```

**Cheapest break:** [SEC-002](findings/SEC-002-unauthenticated-password-reset.md) — bind the reset to a single-use token. Half a day.
**Caution:** fixing SEC-002 alone makes a `Math.random()` OTP with no attempt limit the sole barrier. Ship [SEC-018](findings/SEC-018-insecure-randomness.md) and [SEC-021](findings/SEC-021-insufficient-anti-automation.md) in the same release.

### Chain C — Upload to session theft to tenant compromise

```
SEC-014  Upload text/html — MIME type is client-supplied
   ↓
SEC-023  /assets serves it as HTML on the API's own origin
   ↓
SEC-019  No CSP, no nosniff — nothing contains the script
   ↓
         Script reads the clinician's token from browser storage
   ↓
SEC-017  Token is valid 24h and cannot be revoked
   ↓
SEC-001 + SEC-009  That token reaches every tenant's data
```

**Cheapest break:** `Content-Disposition: attachment` on `/assets` ([SEC-019](findings/SEC-019-missing-security-headers.md)) — the browser downloads instead of rendering, and the chain stops at step 2.

### Chain D — Anonymous to cloud credentials

```
SEC-008  POST /prescription/detail is unauthenticated
   ↓
SEC-015  signature value lands unescaped inside <img src="...">
   ↓
         Puppeteer renders it with --no-sandbox
   ↓
         Server fetches http://169.254.169.254/... (instance metadata)
   ↓
         Cloud credentials for the PHI infrastructure
```

**Cheapest break:** request interception in Puppeteer plus `setJavaScriptEnabled(false)` ([SEC-015](findings/SEC-015-html-injection-puppeteer-pdf.md)) — the template needs no external resources.

---

## 5. Where the model breaks down

Three design assumptions produced most of the findings. Naming them matters more than any individual fix, because they will otherwise reproduce in new code.

### Assumption 1 — "The payload is encrypted, so the caller is legitimate"

Encryption proves possession of a key. Every client has the key; so does anyone with the repository; and the server mints ciphertext on request. It never proved identity, and treating it as a gate is why chat, prescription and OpenTok routes carry no authentication.

**Correction:** authentication and payload encryption are orthogonal. Apply authentication to every route independently; treat payload encryption as defence in depth over TLS.

### Assumption 2 — "The client tells us who it is"

The `role` header, the `companyId` header and body-supplied `patientId` values are all treated as authenticated facts. The token carries a truthful role and is never consulted for authorization.

**Correction:** every authorization input comes from the verified token or from a server-side lookup keyed by it. If a client can set it, it is data, not identity.

### Assumption 3 — "Middleware applies everywhere"

It applies to Express. Socket.IO shares the server, reaches the same services, and traverses none of it.

**Correction:** enumerate every entry point, not every router. Each transport needs its own authentication, authorization, rate limiting and audit logging.

---

## 6. Detection and response gaps

Even after the preventive fixes, the platform would be poorly placed to detect or investigate an intrusion.

| Gap | Consequence | Finding |
|---|---|---|
| No structured audit trail | No record of who accessed which patient's data | [SEC-016](findings/SEC-016-credentials-and-phi-in-logs.md) |
| No authentication-failure logging | Brute force and credential stuffing are invisible | [SEC-021](findings/SEC-021-insufficient-anti-automation.md) |
| No Socket.IO logging | An attacker reading the entire chat corpus leaves no trace | [SEC-007](findings/SEC-007-socketio-no-authentication.md) |
| No access log | `morgan` is installed but never wired up | [SEC-019](findings/SEC-019-missing-security-headers.md) |
| No document-access logging | Cannot determine which PHI documents were retrieved | [SEC-023](findings/SEC-023-unauthenticated-static-phi.md) |
| No impersonation record | Actions under an impersonated session are unattributable | [SEC-012](findings/SEC-012-patient-impersonation-endpoint.md) |
| Client IP unreliable | Logged addresses are the proxy's, or attacker-chosen | [SEC-020](findings/SEC-020-trust-proxy-and-xff-spoofing.md) |
| No token revocation | A known-compromised session cannot be terminated without logging out every user | [SEC-017](findings/SEC-017-jwt-hardening-gaps.md) |

The combination means a breach-notification assessment could not currently determine **whose** data was accessed — which, under most regimes, obliges notifying everyone.

---

## 7. Residual risk after remediation

With the roadmap complete, these remain and should be tracked as accepted risks or scheduled work:

- **Insider access.** Care navigators legitimately read patient records. Field-level encryption does not constrain them. Mitigation is audit logging plus review, not prevention.
- **Third-party integrations.** Redcliff, SendGrid, Razorpay and OpenTok each hold or process data; their security is outside this application's control.
- **Infrastructure.** Not in scope for this review. A separate assessment of host hardening, network segmentation, backup encryption and access management is warranted.
- **The frontend applications.** Token storage, XSS in the client, and session handling in the browser were not reviewed.
- **Supply chain.** `npm audit` in CI catches known vulnerabilities, not novel ones or a compromised maintainer.

---

## 8. Recommended review cadence

| Activity | Frequency |
|---|---|
| Automated dependency scanning | Every build |
| Secret scanning | Every commit |
| Security review of changes touching auth, crypto or PHI access | Every pull request |
| Re-run of this review's verification steps | Quarterly |
| Independent penetration test | Annually, and after any major architectural change |
| Threat model refresh | On any new entry point, transport or third-party integration |
