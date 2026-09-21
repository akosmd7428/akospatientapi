# Remediation Roadmap — `patientportalapi`

Sequenced by **dependency**, not only by severity. Several fixes are ineffective or actively misleading if applied in the wrong order — most importantly, rotating the encryption key accomplishes nothing while the decryption oracle endpoints remain live.

Each item links to the finding document, which contains the code-level fix and the acceptance criteria.

---

## Ordering constraints

These must be respected regardless of how the work is scheduled.

| Constraint | Why |
|---|---|
| [SEC-005](findings/SEC-005-public-crypto-oracle-endpoints.md) **before** [SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md) | A new key is defeated on day one while the server decrypts arbitrary input on request. |
| [SEC-010](findings/SEC-010-committed-third-party-credentials.md) rotation **before** history scrubbing | Scrubbing without rotation leaves the credentials valid; every existing clone still has them. |
| [SEC-010](findings/SEC-010-committed-third-party-credentials.md) + [SEC-023](findings/SEC-023-unauthenticated-static-phi.md) scrubbed **together** | One coordinated history rewrite; every collaborator re-clones once, not twice. |
| [SEC-017](findings/SEC-017-jwt-hardening-gaps.md) **before** rotating `JWT_SECRET` | Rotation logs out every user. Ship refresh tokens first so the disruption is bounded. |
| [SEC-001](findings/SEC-001-broken-role-enforcement.md) **before** [SEC-009](findings/SEC-009-tenant-isolation-via-client-header.md) | Both remove client-supplied headers; SEC-009 needs the `requireAuth` factory SEC-001 introduces. |
| [SEC-002](findings/SEC-002-unauthenticated-password-reset.md) **with** [SEC-018](findings/SEC-018-insecure-randomness.md) + [SEC-021](findings/SEC-021-insufficient-anti-automation.md) | Fixing SEC-002 alone makes a predictable, unthrottled OTP the *only* barrier on password reset. |
| [SEC-020](findings/SEC-020-trust-proxy-and-xff-spoofing.md) **before** [SEC-021](findings/SEC-021-insufficient-anti-automation.md) | Rate limits do nothing while every request is attributed to the proxy's address. |
| [SEC-011](findings/SEC-011-bola-idor-across-endpoints.md) **with** [SEC-013](findings/SEC-013-mass-assignment.md) | `PatientDetail.update(data, { where: { patientId: data.patientId } })` is both findings at once. Allow-listing fields without fixing target selection still permits cross-patient writes. |
| [SEC-033](findings/SEC-033-stale-duplicate-sources.md) **last** | Use the deletion as the checkpoint confirming every fix landed in the live file, not only a duplicate. |

---

## P0 — Hotfix (this week)

**Goal: close every path that requires no authentication at all.** Four small changes plus one credential rotation.

| # | Action | Finding | Effort |
|---|---|---|---|
| 1 | Delete `/api/auth/encrypt`, `/decrypt`, `/getquery` and their handlers | [SEC-005](findings/SEC-005-public-crypto-oracle-endpoints.md) | 3 lines |
| 2 | Rotate the Bitly token and `AES_SECRET_KEY`; remove the `\|\|` fallback literal | [SEC-010](findings/SEC-010-committed-third-party-credentials.md) | Hours |
| 3 | Require a single-use reset token on `/change-password`; delete the duplicate `/change_password` route | [SEC-002](findings/SEC-002-unauthenticated-password-reset.md) | Half a day |
| 4 | Add authentication to the chat, prescription, OpenTok and unguarded lab routes | [SEC-008](findings/SEC-008-unauthenticated-sensitive-routes.md) | Half a day |
| 5 | Fix the two broken Joi imports; make `validateSchema` throw at boot on a non-schema | [SEC-027](findings/SEC-027-broken-and-missing-validation.md) | Minutes |

**Ship items 3 and 4 together** — item 3's endpoint is reachable partly because of the assumption item 4 corrects.

**Exit criteria:** an unauthenticated caller can no longer reset a password, read a chat transcript, read or write a prescription, mint an OpenTok token, or use the server as a crypto oracle.

---

## P1 — Structural (2–3 weeks)

**Goal: fix the two root causes behind most findings — request-supplied identity, and unauthenticated parallel surfaces.**

### 1a. One authentication and authorization mechanism

Replace the three identical middlewares with a single `requireAuth(...roles)` factory that asserts the **token claim** and ignores request headers entirely.

- [SEC-001](findings/SEC-001-broken-role-enforcement.md) — the factory; remove `role` from `allowedHeaders`.
- [SEC-009](findings/SEC-009-tenant-isolation-via-client-header.md) — add `companyIds` to the token; remove `companyId` from `allowedHeaders`; delete every `req.header('companyId')`.
- [SEC-008](findings/SEC-008-unauthenticated-sensitive-routes.md) — invert the default: deny-by-default at the router level with an explicit public allow-list, plus a CI route-inventory test.
- [SEC-012](findings/SEC-012-patient-impersonation-endpoint.md) — delete the impersonation endpoint, or rebuild it with a relationship check, an audit record and an `act` claim.

### 1b. Close the injection sinks

- [SEC-006](findings/SEC-006-sql-injection.md) — parameterise all 18 statements. Eleven resolve automatically once 1a removes the `companyId` header. Add a CI grep banning template literals in `sequelize.query(` and `literal(`.

### 1c. Authenticate Socket.IO

- [SEC-007](findings/SEC-007-socketio-no-authentication.md) — `io.use()` handshake verification; derive identity from `socket.user`; build room names server-side; replace all six `io.emit` calls with targeted emits; move the handlers out of `index.js`.

### 1d. Credentials

- [SEC-003](findings/SEC-003-unsalted-md5-passwords.md) — bcrypt (cost 12) with transparent rehash-on-login. No user-visible disruption.
- [SEC-035](findings/SEC-035-hardcoded-default-password.md) — replace the shared default with single-use invitation tokens; remediate existing accounts holding it.
- [SEC-020](findings/SEC-020-trust-proxy-and-xff-spoofing.md) → [SEC-021](findings/SEC-021-insufficient-anti-automation.md) → [SEC-018](findings/SEC-018-insecure-randomness.md), in that order: make `req.ip` meaningful, then layer the limiters, then fix OTP entropy and lifecycle.
- [SEC-017](findings/SEC-017-jwt-hardening-gaps.md) — pin the algorithm, add `iss`/`aud`/`jti`/`typ`, 15-minute access tokens, refresh tokens with reuse detection, logout and revocation. **Ship before rotating `JWT_SECRET`.**

**Exit criteria:** no authorization decision reads a request header; no raw SQL contains an interpolated request value; Socket.IO refuses anonymous connections; a stolen token can be revoked.

---

## P2 — Data protection (3–6 weeks)

**Goal: make a successful intrusion less valuable, and make one visible.**

| Action | Finding |
|---|---|
| Systematic ownership checks — `assertCanAccessPatient` + field allow-lists, applied together | [SEC-011](findings/SEC-011-bola-idor-across-endpoints.md), [SEC-013](findings/SEC-013-mass-assignment.md) |
| AES-256-GCM with per-message random IV; key from the environment; fail closed | [SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md), [SEC-029](findings/SEC-029-decryption-middleware-defects.md) |
| Upload allow-listing, magic-byte verification, containment assertion | [SEC-014](findings/SEC-014-unrestricted-file-upload.md) |
| Move `assets/` behind authorization; `Content-Disposition: attachment`; remove PHI from git | [SEC-023](findings/SEC-023-unauthenticated-static-phi.md) |
| Escape PDF template interpolation; re-enable the Chrome sandbox; block subresource fetching | [SEC-015](findings/SEC-015-html-injection-puppeteer-pdf.md) |
| Stop logging request bodies; allow-list logged fields; build a real audit trail | [SEC-016](findings/SEC-016-credentials-and-phi-in-logs.md) |
| Remove `crypto`, `html-pdf`, `bcrypt`; replace `pdf-parse`; add `npm audit` to CI | [SEC-022](findings/SEC-022-vulnerable-dependencies.md) |
| Least-privilege database user; replace `sync()` with migrations; enable TLS to the database | [SEC-030](findings/SEC-030-database-root-empty-password.md) |
| Field-level encryption for PHI columns; `defaultScope` excluding `password`; log retention | [SEC-024](findings/SEC-024-phi-unencrypted-at-rest.md) |

**Coordinated history rewrite.** Once [SEC-010](findings/SEC-010-committed-third-party-credentials.md) rotation (P0) and the [SEC-023](findings/SEC-023-unauthenticated-static-phi.md) asset removal are both ready, perform **one** `git filter-repo` operation covering credentials and PHI, notify every clone holder, and force-push. Record it as a data-handling incident.

**Exit criteria:** a database dump yields ciphertext for the most sensitive fields; patient documents require authorization; PHI access is audited; no known-vulnerable dependency ships.

---

## P3 — Hardening (ongoing)

| Action | Finding |
|---|---|
| `helmet` with a restrictive CSP; HTTPS enforcement; structured access logging | [SEC-019](findings/SEC-019-missing-security-headers.md) |
| Terminal error handler that always responds; remove direct calls from controllers | [SEC-026](findings/SEC-026-broken-error-handler.md) |
| Generic client errors with a correlation id; remove the 180 `error.message` sites | [SEC-025](findings/SEC-025-verbose-error-disclosure.md) |
| Generic responses on all recovery paths; equalise timing with a dummy hash | [SEC-028](findings/SEC-028-account-enumeration.md) |
| Environment-specific CORS; right-sized body limits per route | [SEC-031](findings/SEC-031-cors-and-payload-limits.md) |
| Add the missing Joi schemas; validate `params` and `query`, not only `body` | [SEC-027](findings/SEC-027-broken-and-missing-validation.md) |
| SMTP `requireTLS`; escape email templates; build the SMS URL with `URLSearchParams` | [SEC-034](findings/SEC-034-outbound-channel-weaknesses.md) |
| Move secrets to a managed store; delete `.env.save`; startup secret validation | [SEC-032](findings/SEC-032-secret-sprawl-working-tree.md) |
| Delete stale duplicates; fix `.gitignore`; **verify every fix landed in the live file** | [SEC-033](findings/SEC-033-stale-duplicate-sources.md) |

---

## Guardrails to add alongside the fixes

These prevent regression and are worth more over time than any individual fix. Add each one as its related finding is addressed.

| Guardrail | Prevents recurrence of |
|---|---|
| Route-inventory test: fail CI if a non-public route lacks auth middleware | [SEC-008](findings/SEC-008-unauthenticated-sensitive-routes.md) |
| Route-coverage test: fail CI if a non-GET route lacks `validateSchema` | [SEC-027](findings/SEC-027-broken-and-missing-validation.md) |
| CI grep: template literals inside `sequelize.query(` or `literal(` | [SEC-006](findings/SEC-006-sql-injection.md) |
| CI grep: `process.env.X \|\| '<literal>'` | [SEC-010](findings/SEC-010-committed-third-party-credentials.md) |
| CI grep: password-like literal assignments | [SEC-035](findings/SEC-035-hardcoded-default-password.md) |
| Lint: ban `Math.random()` outside tests | [SEC-018](findings/SEC-018-insecure-randomness.md) |
| Lint: `strict` mode and `no-undef` as errors | [SEC-029](findings/SEC-029-decryption-middleware-defects.md) |
| Lint/CI: ban `console.log` in `controllers/`, `services/`, `middleware/` | [SEC-016](findings/SEC-016-credentials-and-phi-in-logs.md) |
| `gitleaks` pre-commit hook and CI job | [SEC-010](findings/SEC-010-committed-third-party-credentials.md), [SEC-032](findings/SEC-032-secret-sprawl-working-tree.md) |
| `npm audit --audit-level=high` in CI; Dependabot or Renovate | [SEC-022](findings/SEC-022-vulnerable-dependencies.md) |
| Startup assertions: required secrets present, correctly sized, not revoked; `trust proxy` set | [SEC-010](findings/SEC-010-committed-third-party-credentials.md), [SEC-020](findings/SEC-020-trust-proxy-and-xff-spoofing.md), [SEC-030](findings/SEC-030-database-root-empty-password.md) |
| `.gitignore` covering PHI paths and backup-file patterns | [SEC-023](findings/SEC-023-unauthenticated-static-phi.md), [SEC-033](findings/SEC-033-stale-duplicate-sources.md) |
| Header integration test asserting each security header | [SEC-019](findings/SEC-019-missing-security-headers.md) |
| Automated horizontal-access test suite, one case per endpoint | [SEC-011](findings/SEC-011-bola-idor-across-endpoints.md) |

---

## Non-code actions

Not fixed by a pull request, and easy to lose track of.

| Action | Owner | Finding |
|---|---|---|
| Confirm whether the GitHub repository is public or private | | [SEC-004](findings/SEC-004-hardcoded-aes-key-static-iv.md), [SEC-010](findings/SEC-010-committed-third-party-credentials.md), [SEC-023](findings/SEC-023-unauthenticated-static-phi.md) |
| Assess breach-notification obligations if public | | [SEC-023](findings/SEC-023-unauthenticated-static-phi.md) |
| Rotate all 15 secrets per the inventory table | | [SEC-032](findings/SEC-032-secret-sprawl-working-tree.md) |
| Decommission or rotate the `legacy_prod` database credential | | [SEC-032](findings/SEC-032-secret-sprawl-working-tree.md) |
| Purge or re-encrypt the existing `logs` table; rotate every SSO `client_secret` written to it | | [SEC-016](findings/SEC-016-credentials-and-phi-in-logs.md) |
| Audit Bitly links for unauthorised modification | | [SEC-010](findings/SEC-010-committed-third-party-credentials.md) |
| Identify and remediate accounts still holding the default password | | [SEC-035](findings/SEC-035-hardcoded-default-password.md) |
| Confirm the applicable regulatory regime; add a mapping appendix if required | | [README](README.md) |
| Notify clone holders before the history rewrite | | [SEC-010](findings/SEC-010-committed-third-party-credentials.md) |
| Configure SPF, DKIM and DMARC for the sending domain | | [SEC-034](findings/SEC-034-outbound-channel-weaknesses.md) |
| Verify MySQL is not reachable from outside the application subnet | | [SEC-030](findings/SEC-030-database-root-empty-password.md) |

---

## Verification checkpoints

| Checkpoint | Test |
|---|---|
| **After P0** | An unauthenticated sweep of the chat, prescription, OpenTok, lab and crypto-oracle endpoints returns 401/404 on every one. |
| **After P1** | A patient token is rejected by every HR and care-navigator route (403); `companyId` and `role` headers have no effect; anonymous Socket.IO connections are refused; injection probes against all 18 sinks fail. |
| **After P2** | A database dump yields ciphertext for encrypted fields; `/assets` requires authorization; PHI access produces audit records; `npm audit --audit-level=high` exits 0. |
| **After P3** | `securityheaders.com` grade is A; no 500 response body contains database detail; enumeration probes return identical responses. |
| **Final** | Independent penetration test against a staging environment, using this document set as the starting scope. |

---

## A note on sequencing under time pressure

If capacity forces a choice, prioritise in this order:

1. **P0 in full** — five items, roughly two days, and it closes the unauthenticated attack surface. There is no good reason to defer any of it.
2. **P1 items 1a and 1b** — the authentication factory and the injection fixes. Together they remove the two mechanisms behind most of the Critical findings.
3. **P1 item 1c** — Socket.IO. Easy to overlook because it is not in the routers, and it is a complete bypass of everything 1a achieves.

Deferring P2 and P3 is defensible with the earlier phases complete. Deferring P0 is not: those paths require no credentials, leave little trace, and two of them are reachable with a single HTTP request.
