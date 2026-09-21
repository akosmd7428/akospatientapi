# SEC-010 — Live credentials hardcoded in git-tracked source

| Field | Value |
|---|---|
| Severity | **Critical** |
| CVSS v3.1 | 8.6 (`AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:L/A:N`) |
| OWASP Top 10 2021 | A02:2021 – Cryptographic Failures; A05:2021 – Security Misconfiguration |
| OWASP ASVS 4.0.3 | V6.4.1 – Secrets managed by a secret vault, not source; V14.2.1 – No sensitive data in source control; V2.10.4 – Secrets not stored in code |
| CWE | CWE-798 – Use of Hard-coded Credentials; CWE-540 – Inclusion of Sensitive Information in Source Code |
| Status | Open |
| Affected component | `services/bitlyService.js`, `helpers/aesCryptoHelper.js`, `config/encryption.js`, `controllers/patientController.js`, `controllers/hrController.js` |

## Summary

Several live credentials are hardcoded in files tracked by git. The most consequential is in `helpers/aesCryptoHelper.js`, where the production `AES_SECRET_KEY` appears as a fallback literal that is **byte-identical to the value in `.env`**. The `.env` file itself was correctly kept out of git — but the key leaked anyway, through the fallback.

A live Bitly API token is also present in source, along with the payload-encryption key and IV covered separately in [SEC-004](SEC-004-hardcoded-aes-key-static-iv.md).

Because these values are in git **history**, editing the files does not remove them. Every clone, fork, CI cache and local working copy retains them. Remediation requires credential **rotation** — history rewriting alone is insufficient, and editing alone accomplishes nothing.

## Affected code

Values below are redacted to first four characters plus length. The files contain them in full.

### The AES key, leaked via a fallback literal

`helpers/aesCryptoHelper.js:7` and `:19`:

```js
const key = process.env.AES_SECRET_KEY || 'a2f4…';   // 64 hex chars — the real production key
```

The literal matches `AES_SECRET_KEY` in `.env:2` and `.env.save:2` exactly. The `||` fallback pattern is the mechanism of the leak: it looks like a resilience measure but publishes the secret it is falling back from.

**Positive note on the same file:** `helpers/aesCryptoHelper.js:8` generates a fresh `crypto.randomBytes(16)` IV per call and returns it — this is the correct pattern, and the one `config/encryption.js` should adopt. The only defect here is the committed fallback key.

### Live Bitly API token

`services/bitlyService.js:3`:

```js
const BITLY_ACCESS_TOKEN = '4c85…';      // 40 hex chars
```

Used as a bearer credential at `:14`. The call site in `helpers/generatePrescription.js:251` is currently commented out, but the token remains live on Bitly's side until rotated.

### Payload encryption key and IV

`config/encryption.js:4-7` — covered in full in [SEC-004](SEC-004-hardcoded-aes-key-static-iv.md); listed here because it is part of the same rotation operation.

### Hardcoded XOR key

`controllers/patientController.js:286`:

```js
const secretKey = "8D3f…";               // 32 chars
```

The XOR decode this guarded is commented out at `:302-306` and `:325-330`, so the endpoint currently trusts the raw `?email=`/`?token=` query values with no transformation at all — see [SEC-008](SEC-008-unauthenticated-sensitive-routes.md).

### Hardcoded default account password

`controllers/hrController.js:269` — `const password = 'Akos…';` — see [SEC-035](SEC-035-hardcoded-default-password.md).

### Confirmed *not* leaked

Two negative findings worth recording, because they narrow the rotation scope:

- **`.env` and `.env.save` were never committed.** `git log --all --diff-filter=A --name-only | grep -i env` returns only `config/secret.js` and some `.save`/`_555` source files — no environment files. `.gitignore:1-2` covers `.env` and `.env.*`.
- **`config/secret.js` is clean.** It is tracked, but all 33 assignments read from `process.env` with no hardcoded values. Good hygiene — the leaks are the fallback literals elsewhere.

The practical consequence is that the credentials in `.env` (`JWT_SECRET`, SendGrid, Razorpay, OpenTok, SMS, SMTP, `SYNC_API_KEY`) are **not** known to have been exposed via git. They remain at risk through the working-tree exposure described in [SEC-032](SEC-032-secret-sprawl-working-tree.md), and through `LOAD_FILE()` if [SEC-006](SEC-006-sql-injection.md) is exploited against the `root` database account — but they are a lower rotation priority than the two values that are demonstrably in history.

## Technical detail

A secret in git history is permanent until rotated. `git rm`, an amended commit or a new commit removing the line all leave the value retrievable via `git log -p`, `git show <sha>`, reflogs, and every existing clone. Forks and CI caches are outside the repository owner's control entirely.

The `process.env.X || '<literal>'` idiom is the specific anti-pattern to eliminate. It defeats fail-closed behaviour: a misconfigured deployment silently runs on the hardcoded key instead of refusing to start, so the misconfiguration is never noticed and the hardcoded key is exercised in production.

**Exposure scope depends on repository visibility.** If `github.com/akosmd7428/akospatientapi` is public, these values have been world-readable — and are likely already indexed by automated secret scanners, which crawl public GitHub continuously and typically find new keys within minutes. If private, exposure is limited to current and former collaborators, which is still a population that should not be assumed trustworthy indefinitely.

## Exploit scenario

**AES key**

1. Attacker obtains repository access — a fork, a former contributor's clone, a leaked laptop, or public visibility.
2. `grep -rn "AES_SECRET_KEY" .` yields the key on the first hit.
3. Everything `aesCryptoHelper` protects is now readable, and the attacker can forge valid ciphertext for it.

**Bitly token**

4. `curl -H "Authorization: Bearer 4c85…" https://api-ssl.bitly.com/v4/bitlinks` — the attacker controls the organisation's link-shortening account.
5. They create short links under the company's Bitly domain, or **modify existing ones**. Because prescription emails contain Bitly links (`helpers/generatePrescription.js:251`), an attacker can repoint a link a patient already received to a phishing page — an attack with high credibility because the link genuinely originated from the clinic.

**Historical retrieval**

6. Even after the literals are edited out, `git log -p -- helpers/aesCryptoHelper.js` recovers them from any clone.

## Impact

- **Confidentiality:** the AES key exposes everything encrypted with it. The Bitly token exposes the organisation's link account and the links already sent to patients.
- **Integrity:** forged ciphertext; redirection of already-delivered patient links.
- **Scope:** changed — compromise extends to a third-party service outside the application's own security boundary, which is why the CVSS vector carries `S:C`.
- **Operational:** rotation requires a coordinated release, so the window between discovery and closure is measured in days, not minutes.

## Remediation

Execute in this order. **Rotate first** — history rewriting without rotation leaves the credentials valid.

**Step 1 — rotate every exposed credential (do this today).**

| Credential | Action |
|---|---|
| Bitly access token | Revoke at Bitly, issue a new one, place in `.env`. Audit existing Bitly links for unauthorised modification. |
| `AES_SECRET_KEY` | Generate `openssl rand -hex 32`. Plan re-encryption of any data at rest encrypted under the old key. |
| Payload key/IV (`config/encryption.js`) | New key; migrate to GCM per [SEC-004](SEC-004-hardcoded-aes-key-static-iv.md). |
| `secretKey` in `patientController.js` | Delete the constant and the dead XOR code outright — do not replace it. |
| `'Akos…'` default password | Remove; replace with a per-account random invite token ([SEC-035](SEC-035-hardcoded-default-password.md)). |

**Step 2 — remove every fallback literal and fail closed.**

```js
// helpers/aesCryptoHelper.js
function loadKey() {
    const raw = process.env.AES_SECRET_KEY;
    if (!raw) {
        throw new Error('AES_SECRET_KEY is not set');     // refuse to start, never fall back
    }
    const key = Buffer.from(raw, 'hex');
    if (key.length !== 32) throw new Error('AES_SECRET_KEY must be 32 bytes (64 hex chars)');
    return key;
}
const KEY = loadKey();
```

Add a startup configuration check that asserts every required secret is present, correctly sized, and not equal to any known-compromised value:

```js
// config/validateEnv.js — called first in index.js, before anything listens
const REQUIRED = ['JWT_SECRET', 'AES_SECRET_KEY', 'PAYLOAD_ENC_KEY', 'DB_PASSWORD1', 'SYNC_API_KEY'];
const REVOKED = new Set([/* sha256 of each rotated-out value */]);

for (const name of REQUIRED) {
    const v = process.env[name];
    if (!v)            throw new Error(`Missing required secret: ${name}`);
    if (v.length < 32) throw new Error(`${name} is too short`);
    if (REVOKED.has(sha256(v))) throw new Error(`${name} is a revoked credential — rotate it`);
}
```

The revoked-value check is what prevents a stale deployment or an old `.env.save` from quietly reintroducing a compromised key.

**Step 3 — scrub history.** After rotation, and after notifying everyone holding a clone:

```bash
git filter-repo --replace-text secrets.txt    # secrets.txt maps each literal to ***REMOVED***
git push --force --all
git push --force --tags
```

Every collaborator must re-clone; old clones will not fast-forward. Coordinate SEC-004's key with this operation so history is rewritten once.

**Step 4 — prevent recurrence.**

- Add a pre-commit hook and a CI job using `gitleaks` or `trufflehog` that fails on high-entropy strings and known key formats.
- Add a lint rule banning `process.env.X || '<literal>'`.
- Move secrets to a managed store (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault) rather than `.env` files on disk — see [SEC-032](SEC-032-secret-sprawl-working-tree.md).

## Verification

1. **No literals:** `gitleaks detect --source . --no-git` reports zero findings in the working tree.
2. **No history:** after scrubbing, `git log --all -p -S'4c85' | head` and the same for `a2f4` return nothing.
3. **Fail-closed boot:** start the process with `AES_SECRET_KEY` unset — it must exit with a clear error, not start.
4. **Revocation confirmed:** the old Bitly token returns 401 from Bitly's API.
5. **No fallbacks:** `grep -rnE "process\.env\.[A-Z_]+ *\|\| *['\"]" --include=*.js . | grep -v node_modules` returns nothing.
6. **CI gate:** a test commit containing a dummy high-entropy string is rejected by the pipeline.

## Open question for the owner

**Is `github.com/akosmd7428/akospatientapi` public or private?** If public, treat these credentials as compromised by unknown third parties, rotate immediately, and assess whether the disclosure triggers a breach notification. If private, enumerate everyone who has ever had read access — including former staff and contractors — and rotate on that basis.

## References

- OWASP Top 10 2021 — [A05:2021 Security Misconfiguration](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)
- OWASP — [Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- GitHub — [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- CWE-798 — [Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
