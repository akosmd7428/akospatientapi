# SEC-033 — Stale duplicate source files shipped in the repository

| Field | Value |
|---|---|
| Severity | **Low** |
| CVSS v3.1 | 3.7 (`AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N`) |
| OWASP Top 10 2021 | A05:2021 – Security Misconfiguration |
| OWASP ASVS 4.0.3 | V14.2.2 – Unneeded features, documentation and sample code removed; V14.3.2 – Debug modes and sample applications removed |
| CWE | CWE-1188 – Insecure Default Initialization; CWE-1071 – Empty Code Block / Dead Code |
| Status | Open |
| Affected component | Repository hygiene |

## Summary

The repository contains forked copies of live source files under `_555`, `_222` and `.save` suffixes, plus a controller living in the `routes/` directory. They are not required by the running application, but they contain the same vulnerable code as their live counterparts.

The security consequence is a maintenance trap: a fix applied to `controllers/labTestController.js` will not reach `routes/labTestController.js`. If a duplicate is ever accidentally mounted — a plausible outcome given a filename collision between a controller and the routes directory — a patched vulnerability returns silently.

## Affected files

**Tracked in git:**

| File | Notes |
|---|---|
| `routes/labTestController.js` | A **controller** in the routes directory — a near-duplicate of `controllers/labTestController.js`, with its own `Math.random()` booking identifiers at `:311, :366` ([SEC-018](SEC-018-insecure-randomness.md)) |
| `routes/labTestRoutes.js_555` | Forked router |
| `controllers/labTestController.js_555` | Forked controller — contains the `req.params.patientId` IDOR at `:209` ([SEC-011](SEC-011-bola-idor-across-endpoints.md)) |
| `services/labTestService.js_555` | Forked service — contains unparameterised queries mirroring [SEC-006](SEC-006-sql-injection.md) |
| `services/dataService.js_222` | Forked service — contains the unchecked upload path of [SEC-014](SEC-014-unrestricted-file-upload.md) |
| `index.js.save` | Previous bootstrap. No secrets, but it exposes the historical route map and CORS policy; `:65` shows an earlier handler that did `console.error(err)` before returning `err.message` |
| `test-code.js` | A JavaScript scratchpad. `:112` contains a dummy password literal and `:118` logs it; contributes 27 of the 240 `console.log` calls |
| `test-client-chat.js` | Hardcodes the **production** URL `https://patientportalapi.akosmd.in` and opens an unauthenticated socket to it ([SEC-007](SEC-007-socketio-no-authentication.md)) |

**Untracked but present on disk:** `.env.save` ([SEC-032](SEC-032-secret-sprawl-working-tree.md)), `deletem.txt` (0 bytes).

**`.gitignore` defects:**

- `.gitignore:32` contains a mangled UTF-16 line (`g o o g l e - c h r o m e …`) that matches nothing.
- `.gitignore:35` ignores `src/config/database.config.js`, a path that does not exist in this project — suggesting the file was copied from another codebase.

## Technical detail

**Why duplicates are a security problem, not just untidiness.** Every finding in this report identifies specific file and line locations for remediation. A developer fixing [SEC-006](SEC-006-sql-injection.md) will parameterise `services/labTestService.js` and reasonably consider the work done. `services/labTestService.js_555` retains the vulnerable query. Should that file ever be renamed back, imported during a debugging session, or restored during a merge conflict, the vulnerability returns with no code review.

**`routes/labTestController.js` is the most likely to cause trouble.** A controller inside the routes directory is precisely the kind of file a future refactor or an automatic index might pick up. It is also the file most likely to be edited by mistake, since its name matches the real controller.

**`test-client-chat.js` points at production.** A test client hardcoding the production URL invites someone to run it against live PHI. That it can connect at all without credentials is [SEC-007](SEC-007-socketio-no-authentication.md); that the script is committed makes exercising it trivial.

**Repository signal.** These files, together with the `.gitignore` entry for a non-existent path, indicate the repository was assembled by copying rather than by migration. That is worth noting because it raises the likelihood of other inherited configuration that does not match this deployment.

## Exploit scenario

This finding has no direct exploit path — the files are not mounted. The realistic scenario is a regression:

1. Security fixes are applied to `services/labTestService.js` and `controllers/labTestController.js`.
2. Months later, a developer investigating a bug notices `services/labTestService.js_555`, assumes it is a newer variant given the suffix, and copies logic from it — reintroducing an unparameterised query.
3. Alternatively, a merge conflict resolution or a build script picks up `routes/labTestController.js`, and the IDOR at `:209` becomes live again.
4. No review catches it, because the code "already existed in the repository".

A secondary scenario: an attacker with repository access reads `index.js.save` to learn the historical route map, including endpoints that may still exist but are undocumented.

## Impact

- **Integrity of the remediation effort:** patched vulnerabilities can silently return. This is the main cost.
- **Confidentiality:** minor — historical configuration disclosure to anyone with repository access.
- **Maintainability:** duplicated code drifts, and reviewers cannot tell which copy is authoritative.

## Remediation

**Step 1 — verify nothing imports them,** then delete:

```bash
# Confirm no references first.
grep -rn "labTestController\|dataService.js_222\|labTestService.js_555" --include=*.js . | grep -v node_modules

git rm routes/labTestController.js \
       routes/labTestRoutes.js_555 \
       controllers/labTestController.js_555 \
       services/labTestService.js_555 \
       services/dataService.js_222 \
       index.js.save \
       test-code.js \
       test-client-chat.js

rm -f .env.save deletem.txt     # .env.save: see SEC-032 first
```

Git history preserves anything genuinely needed later, which is the argument for deleting rather than keeping "just in case".

**Step 2 — fix `.gitignore`.** Remove the mangled UTF-16 line at `:32` and the irrelevant `src/config/database.config.js` at `:35`. Add patterns preventing recurrence, and the PHI exclusions from [SEC-023](SEC-023-unauthenticated-static-phi.md):

```gitignore
# Editor and shell backup artefacts
*.save
*.bak
*.orig
*.rej
*_[0-9][0-9][0-9]
*~

# Patient documents — PHI. Never commit. (SEC-023)
assets/patient/
assets/prescription/
assets/prescriptions/
assets/report/
assets/chat/
assets/signature/
assets/careNavigator/
assets/2024/
!assets/akosLogo.png
```

**Step 3 — if a test client is genuinely useful,** rewrite it to read its target from an environment variable defaulting to localhost, require a token, and place it under `tools/` or `test/` with a clear README:

```js
const url = process.env.TEST_TARGET || 'http://localhost:3001';
if (url.includes('akosmd.in')) {
    throw new Error('Refusing to run the test client against production.');
}
```

**Step 4 — add a CI check** that fails the build if a file matching `*.save`, `*.bak` or `*_[0-9][0-9][0-9]` is committed, or if a file named `*Controller.js` appears outside `controllers/`.

**Step 5 — while deleting, confirm** that each finding's remediation was applied to the *live* file and that no duplicate retained the vulnerable version. Use this deletion as the checkpoint for that review.

## Verification

1. **Files gone:** `git ls-files | grep -E '\.save$|_555$|_222$'` returns nothing.
2. **Nothing broke:** the application starts and the full route table is unchanged.
3. **No stray references:** `grep -rn "require.*_555\|require.*_222" --include=*.js . | grep -v node_modules` returns nothing.
4. **`.gitignore` valid:** `git check-ignore -v assets/patient/x.png` confirms the pattern matches; no mangled lines remain.
5. **CI gate:** committing a test `foo.save` file fails the pipeline.
6. **Remediation completeness:** for each finding in this report, confirm the fix exists in the live file and that no duplicate remains with the old code.

## References

- OWASP ASVS 4.0.3 — V14.2 Dependency; V14.3 Unintended Security Disclosure
- OWASP — [Source Code Disclosure](https://owasp.org/www-community/attacks/Source_Code_Disclosure)
- CWE-1188 — [Insecure Default Initialization of Resource](https://cwe.mitre.org/data/definitions/1188.html)
