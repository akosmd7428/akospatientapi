# SEC-032 — Secret sprawl in the working tree, including a stale production database credential

| Field | Value |
|---|---|
| Severity | **Low** |
| CVSS v3.1 | 4.4 (`AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`) |
| OWASP Top 10 2021 | A05:2021 – Security Misconfiguration |
| OWASP ASVS 4.0.3 | V6.4.1 – Secrets managed in a secret vault; V2.10.4 – Secrets not stored in unencrypted form; V14.1.3 – Environment-specific configuration |
| CWE | CWE-522 – Insufficiently Protected Credentials; CWE-312 – Cleartext Storage of Sensitive Information |
| Status | Open |
| Affected component | `.env`, `.env.save`, deployment process |

## Summary

Fifteen production secrets sit in plaintext files on the application host. `.gitignore` correctly excludes them and git history confirms **neither `.env` nor `.env.save` was ever committed** — that part is right.

The problem is what remains on disk. `.env.save` is a stale leftover containing credentials for a **different, production database** (`legacy_prod` / user `akoscare`) than the one the application currently uses. Neither file is encrypted, so both are captured by any backup, container image, disk snapshot or support bundle taken of the directory.

This is rated Low because exploitation requires host or backup access. It is documented in full because it is the **rotation inventory** for the incidents in [SEC-010](SEC-010-committed-third-party-credentials.md) and [SEC-006](SEC-006-sql-injection.md), where these same values become remotely reachable.

## Inventory

Values redacted to first four characters plus length. This table is the authoritative rotation checklist.

| File:line | Variable | Redacted | Length | Priority |
|---|---|---|---|---|
| `.env:1`, `.env.save:1` | `JWT_SECRET` | `DOUy…` | 64 | **High** — forges any session ([SEC-017](SEC-017-jwt-hardening-gaps.md)) |
| `.env:2`, `.env.save:2` | `AES_SECRET_KEY` | `a2f4…` | 64 hex | **Critical** — identical to the git-committed literal ([SEC-010](SEC-010-committed-third-party-credentials.md)) |
| `.env.save:6` | `DB_PASSWORD` (`legacy_prod` / `akoscare`) | `Akos…` | 14 | **High** — a *different* production database |
| `.env:6-7` | `DB_USER1` / `DB_PASSWORD1` | `root` / *(empty)* | — | **High** — see [SEC-030](SEC-030-database-root-empty-password.md) |
| `.env:13` | `API_KEY` (OpenTok/Vonage) | `4636…` | 8 | Medium |
| `.env:14` | `API_SECRET` (OpenTok/Vonage) | `85fe…` | 40 hex | Medium |
| `.env:16` | `DEV_PAYU_MONEY_SALT` | `rh6w…` | 32 | Medium |
| `.env:17` | `DEV_PAYU_MONEY_KEY` | `6nKH…` | 8 | Medium |
| `.env:23` | `REDCLIFF_KEY` | `xQTv…` | 32 | Medium |
| `.env:24` | `REDCLIFF_COOKIE` | `5dcf…` | 36 | Medium |
| `.env:28`, `.env.save:9` | `DEV_SENDGRID_API_KEY` | `SG.G…` | 69 | Medium — live-format SendGrid key |
| `.env:33` | `SMS_API_KEY` | `WxQl…` | 16 | Medium — also logged ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)) |
| `.env:42` | `SMTP_PASSWORD` (`support@akosmd.in`, Office 365) | `Zab1…` | 8 | **High** — 8 characters is weak for a mailbox credential |
| `.env:46-47` | `RAZORPAY_KEY_ID` / `RAZORPAY_SECRET` | `rzp_…` / `d9rs…` | 22 / 24 | Medium — appears to be a test key |
| `.env:51` | `SYNC_API_KEY` | `70f3…` | 64 hex | Medium |

**Confirmed clean:**

- `git log --all --diff-filter=A --name-only | grep -i env` returns no environment files — neither was ever committed.
- `.gitignore:1-2` covers `.env` and `.env.*`.
- `config/secret.js` is tracked but contains no literals; all 33 assignments read from `process.env`.

## Technical detail

**`.env.save` is the sharpest edge.** It is not loaded by the application, so it receives no attention, yet it holds credentials for a *different* production database. Two consequences: the `legacy_prod` credential is likely unrotated and long-lived, and anyone finding the file has a second database to attack that nobody is monitoring in the context of this application.

**Plaintext on disk is captured by processes nobody thinks of as security-relevant.** Container images built with `COPY . .`, `tar` backups, disk snapshots, developer copies, support bundles and log-collection agents all pick these files up. Each copy is a place the credential can leak from, and none is tracked.

**The 8-character SMTP password is independently weak.** A mailbox that sends OTPs and appointment information should not be protected by an 8-character credential; it is brute-forceable and, if compromised, allows an attacker to send mail *as the clinic*.

**The critical dependency.** This finding is Low in isolation because it requires host access. But [SEC-006](SEC-006-sql-injection.md) plus [SEC-030](SEC-030-database-root-empty-password.md) provides exactly that: `LOAD_FILE('/var/www/patientportalapi/.env')` from an unauthenticated SQL injection returns this entire table to a remote attacker. Fixing either of those findings breaks that chain; fixing this one reduces the value of the prize.

## Exploit scenario

1. Attacker obtains read access to the application directory — through the SQL injection `FILE` primitive, the arbitrary file write in [SEC-014](SEC-014-unrestricted-file-upload.md), a leaked backup, or a container image pushed to a registry.
2. `cat .env .env.save` yields the full table above.
3. With `JWT_SECRET`, the attacker forges a token for any user and role. Every access-control fix in this report is bypassed in one step.
4. With `AES_SECRET_KEY`, they decrypt anything the platform encrypted.
5. With the `legacy_prod` credential, they access a second production database that the current incident response may not even consider in scope.
6. With `DEV_SENDGRID_API_KEY` and `SMTP_PASSWORD`, they send mail as the clinic — a high-credibility phishing platform against patients.

## Remediation

**Step 1 — delete `.env.save` from every host,** after confirming the `legacy_prod` database is decommissioned or its credential is rotated. Search for other stray copies:

```bash
find / -name '.env*' -not -path '*/node_modules/*' 2>/dev/null
```

**Step 2 — rotate on the priority order in the inventory.** `AES_SECRET_KEY` first (it is in git history — [SEC-010](SEC-010-committed-third-party-credentials.md)), then `JWT_SECRET`, the database credentials and `SMTP_PASSWORD`. Note that rotating `JWT_SECRET` invalidates every live session; schedule it, and implement refresh tokens first ([SEC-017](SEC-017-jwt-hardening-gaps.md)) so the disruption is bounded.

**Step 3 — move secrets to a managed store.** AWS Secrets Manager, Azure Key Vault or HashiCorp Vault — fetched at startup, held in memory, never written to disk:

```js
// config/secrets.js
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function loadSecrets() {
    if (process.env.NODE_ENV !== 'production') return process.env;   // .env for local dev only
    const client = new SecretsManagerClient({});
    const res = await client.send(new GetSecretValueCommand({ SecretId: 'patientportalapi/prod' }));
    return Object.assign(process.env, JSON.parse(res.SecretString));
}
```

This also gives rotation without redeployment, per-secret access audit trails, and automatic encryption at rest.

**Step 4 — commit a `.env.example`** with every key name and empty values, so a missing variable is obvious and nobody copies a real file as a template:

```
JWT_SECRET=
AES_SECRET_KEY=
DB_USER1=
DB_PASSWORD1=
```

**Step 5 — validate at startup and fail closed.** Assert every required secret is present, correctly sized, and not a known-revoked value ([SEC-010](SEC-010-committed-third-party-credentials.md)).

**Step 6 — harden the deployment.** Exclude `.env*` from container builds via `.dockerignore`; ensure backups of the application directory are encrypted; restrict file permissions to `600`, owned by the application user.

**Step 7 — set a strong `SMTP_PASSWORD`** (32+ characters), or better, switch to OAuth2 for Office 365 so no static password exists.

## Verification

1. **No stray files:** the `find` command returns only the intended `.env` on the application host, and nothing named `.env.save`.
2. **Not in images:** `docker run --rm <image> ls -la /app/.env*` returns nothing.
3. **Rotation:** each old credential is confirmed rejected by its provider — the old SendGrid key returns 401, the old database credential fails to authenticate.
4. **Fail closed:** starting with a required secret unset causes an immediate, clear startup failure.
5. **Permissions:** `stat -c '%a %U' .env` shows `600` and the application user.
6. **Backups:** confirm backups of the application directory are encrypted at rest.
7. **`legacy_prod`:** confirm the database is decommissioned, or its credential rotated and its access logs reviewed.

## References

- OWASP — [Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V6.4 Secret Management
- The Twelve-Factor App — [Config](https://12factor.net/config)
- CWE-522 — [Insufficiently Protected Credentials](https://cwe.mitre.org/data/definitions/522.html)
