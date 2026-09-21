# SEC-022 — Vulnerable and deprecated dependencies, including a squatted `crypto` package

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`) |
| OWASP Top 10 2021 | A06:2021 – Vulnerable and Outdated Components |
| OWASP ASVS 4.0.3 | V14.2.1 – Components are up to date; V14.2.4 – Third-party components from trusted repositories; V1.14.6 – No unsupported technologies |
| CWE | CWE-1104 – Use of Unmaintained Third Party Components; CWE-1395 – Dependency on Vulnerable Third-Party Component |
| Status | Open |
| Affected component | `package.json`, `package-lock.json` |

## Summary

The dependency tree contains twelve deprecated packages, several of which process untrusted input.

The most unusual finding is `crypto@1.0.1` in `package.json`. This is **not** Node's built-in `crypto` module — it is a userland package squatting on the built-in's name, deprecated by npm precisely because of the confusion it causes. Because `node_modules` takes precedence over the built-in for bare specifiers in CommonJS resolution, every `require('crypto')` in this application — password hashing, AES, random generation — may resolve to this third-party package rather than to Node core. That is a supply-chain hijack primitive sitting in the middle of the application's cryptography.

Also present: `html-pdf` (deprecated) pulling `phantomjs-prebuilt` (abandoned since 2018, ships a stale unsandboxed WebKit) and `request` (deprecated since 2020), which drags in `tough-cookie@2.5.0` (CVE-2023-26136, prototype pollution). `pdf-parse@1.1.1` is unmaintained and vendors a pdf.js fork predating the CVE-2024-4367 fix — and it parses attacker-supplied PDFs.

## Affected inventory

Resolved versions from `package-lock.json` (lockfileVersion 3).

### Critical concern

| Package | Declared | Resolved | Issue |
|---|---|---|---|
| `crypto` | `^1.0.1` | 1.0.1 | **Deprecated placeholder squatting the Node built-in name.** npm's own deprecation notice states it should not be used. Shadows `require('crypto')`. Remove from `package.json:21` — the built-in requires no dependency entry. |

### Deprecated and vulnerable chain

| Package | Resolved | Issue |
|---|---|---|
| `html-pdf` | 3.0.1 | Deprecated by its maintainer, who recommends migrating to Puppeteer. This project **already uses Puppeteer** (`helpers/generatePdf.js`), so `html-pdf` appears to be a leftover. |
| `phantomjs-prebuilt` | 2.1.16 | Transitive via `html-pdf`. Deprecated; abandoned since 2018; ships a stale binary WebKit that renders HTML with no sandbox. |
| `request` | 2.88.2 | Transitive via the PhantomJS chain. Deprecated since 2020; receives no security fixes. |
| `tough-cookie` | 2.5.0 | Transitive via `request`. **CVE-2023-26136** — prototype pollution. |
| `har-validator`, `uuid@3.4.0` | — | Transitive; deprecated. `uuid@3` is deprecated in part because older versions used `Math.random()` (cf. [SEC-018](SEC-018-insecure-randomness.md)). |
| `pdf-parse` | 1.1.1 | Unmaintained since 2018. Vendors a pdf.js fork predating the fix for **CVE-2024-4367** (`isEvalSupported` → arbitrary JS execution when parsing a malicious PDF). This package parses **user-uploaded** PDFs. |
| `glob@7`, `inflight`, `rimraf@3`, `npmlog`, `gauge`, `are-we-there-yet` | — | Deprecated transitives. `inflight` has a known memory-leak issue. |

### Duplicated and outdated

| Package | Resolved | Issue |
|---|---|---|
| `bcrypt` + `bcryptjs` | 5.1.1 / 2.4.3 | **Both declared.** `grep` shows only `bcryptjs` is ever required (`services/authService.js:1`, `controllers/hrController.js:22`, `services/patientProfileService.js:3`). The native `bcrypt` is dead weight and a build-fragility risk. Neither is used on the login path at all — see [SEC-003](SEC-003-unsalted-md5-passwords.md). |
| `puppeteer` | 23.11.1 | Several major versions behind. Bundles its own Chromium, so it carries the browser's vulnerability surface; also pulls `tar-fs@3.0.9` (path-traversal CVE class). Relevant to [SEC-015](SEC-015-html-injection-puppeteer-pdf.md), where the sandbox is disabled. |
| `express` | 4.21.2 | 4.x is maintenance-only; 5.x is current. **4.21.2 is itself patched** — `path-to-regexp@0.1.12`, `send@0.19.0`, `cookie@0.7.1` all resolve to fixed versions. Acceptable, but end-of-life-bound. |
| `socket.io` | 4.8.1 | Current and patched. The risk here is not the version but the absent auth handshake ([SEC-007](SEC-007-socketio-no-authentication.md)). |
| `pdfjs-dist` | 4.10.38 | ≥4.2.67, so **patched** for CVE-2024-4367. The unpatched copy is the one vendored inside `pdf-parse`. |

### Positive findings

- `package-lock.json` is committed — builds are reproducible.
- `node_modules/` is gitignored (`.gitignore:7`).
- No `postinstall` scripts from untrusted packages were observed in the direct dependency set.

## Technical detail

**The `crypto` package is the headline.** In CommonJS resolution, a bare specifier resolves to `node_modules` before falling back to a built-in only for names Node reserves. Historically, an installed package named `crypto` has been able to shadow the built-in in some Node and bundler configurations, and the ambiguity is why npm deprecated the package. This application's `require('crypto')` calls perform password hashing (`services/authService.js:46`), AES (`config/encryption.js`), and random generation (`helpers/commonHelper.js:76`). If any resolves to the squatted package — now or after a tooling change — the application's cryptography is supplied by an unmaintained third party. Even absent active exploitation, this is an unacceptable position for a PHI system, and the fix is to delete one line.

**`pdf-parse` is the most directly exploitable.** CVE-2024-4367 allows JavaScript execution when pdf.js parses a crafted PDF, because `isEvalSupported` defaults to permitting `eval` on font programs. This application accepts PDF uploads ([SEC-014](SEC-014-unrestricted-file-upload.md)) with no type verification, and processes them server-side. An attacker uploads a malicious PDF and achieves code execution in the parsing context.

**The `html-pdf` chain is dead weight carrying live risk.** Puppeteer already handles PDF generation. `html-pdf` contributes an abandoned WebKit binary and the entire `request`/`tough-cookie` subtree. Removing one direct dependency eliminates five deprecated transitives.

**No automated scanning is in place.** There is no `npm audit` in CI, no Dependabot or Renovate configuration, and no SBOM. These findings were identified by manual inspection, which means the next vulnerability will be too.

## Exploit scenario

**Code execution via a malicious PDF**

1. Attacker uploads a crafted PDF through the document endpoint. Type validation is absent ([SEC-014](SEC-014-unrestricted-file-upload.md)).
2. The application parses it with `pdf-parse`, whose vendored pdf.js predates the CVE-2024-4367 fix.
3. Crafted font data triggers `eval`, executing attacker JavaScript in the parsing context — inside the Node process holding the database connection and the environment secrets.

**Supply-chain escalation**

4. A future maintainer publishes a new version of the squatted `crypto` package, or an existing maintainer account is compromised. A routine `npm install` pulls it.
5. The malicious version wraps `createHash` and `randomBytes`, exfiltrating every password and weakening every key. The compromise sits directly inside the application's cryptography with no code change in this repository.

**Prototype pollution**

6. `tough-cookie@2.5.0` (CVE-2023-26136) is reachable through the `request` chain if any PhantomJS code path executes, permitting prototype pollution that can alter application behaviour globally.

## Impact

- **Confidentiality / Integrity / Availability:** all three. Remote code execution via the PDF path; supply-chain compromise of cryptographic primitives; prototype pollution.
- **Maintainability:** unmaintained packages will never receive fixes, so the exposure grows monotonically.
- **Compliance:** HIPAA §164.308(a)(5)(ii)(B) requires protection from malicious software; shipping components with known, published, unpatched vulnerabilities is difficult to defend in an audit.

## Remediation

**Step 1 — remove the squatted `crypto` package (do this first; it is one line).**

```diff
--- a/package.json
   "cors": "^2.8.5",
-  "crypto": "^1.0.1",
   "dotenv": "^16.4.5",
```

Then `rm -rf node_modules && npm ci`. No source change is needed — `require('crypto')` resolves to the Node built-in, which is the intended behaviour.

**Step 2 — remove `html-pdf`** (Puppeteer already covers this) and the unused native `bcrypt`:

```diff
-  "bcrypt": "^5.1.1",
-  "html-pdf": "^3.0.1",
```

This eliminates `phantomjs-prebuilt`, `request`, `tough-cookie@2.5.0`, `har-validator` and `uuid@3` from the tree in one change. Confirm first that nothing imports them: `grep -rn "require('html-pdf')\|require('bcrypt')" --include=*.js . | grep -v node_modules`.

**Step 3 — replace `pdf-parse`.** Use the already-present, already-patched `pdfjs-dist` directly, with `eval` explicitly disabled:

```js
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function extractText(buffer) {
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        isEvalSupported: false,       // explicitly closes CVE-2024-4367
        disableFontFace: true,
        useSystemFonts: false,
    }).promise;
    // ... page iteration
}
```

Parse untrusted PDFs in a worker process with a memory cap and a timeout, so a malicious file cannot take down the API.

**Step 4 — update `puppeteer`** to the current major version and re-enable the sandbox ([SEC-015](SEC-015-html-injection-puppeteer-pdf.md)).

**Step 5 — plan the Express 5 migration.** Not urgent — 4.21.2 is patched — but 4.x is maintenance-only. Schedule it.

**Step 6 — automate, so this does not recur.**

```yaml
# .github/workflows/security.yml
name: security
on: [push, pull_request, schedule]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm audit --audit-level=high        # fails the build on high/critical
      - run: npx better-npm-audit audit          # allow-list for accepted, documented risks
```

Enable Dependabot or Renovate for automated update PRs, and generate an SBOM (`npm sbom --sbom-format cyclonedx`) as a release artefact — increasingly expected in healthcare procurement.

## Verification

1. **`crypto` removed:** `npm ls crypto` reports the package is absent; `node -e "console.log(require.resolve('crypto'))"` prints `crypto` (the built-in), not a `node_modules` path.
2. **Chain removed:** `npm ls phantomjs-prebuilt request tough-cookie` reports empty.
3. **Audit clean:** `npm audit --audit-level=high` exits 0.
4. **Deprecation count:** `npm ls --all 2>&1 | grep -c deprecated` trends toward zero.
5. **PDF safety:** parse a CVE-2024-4367 proof-of-concept PDF and confirm no code execution.
6. **Functional regression:** prescription PDF generation, document upload and PDF text extraction all still work after the dependency changes.
7. **CI gate:** introduce a deliberately vulnerable dependency and confirm the pipeline fails.

## References

- OWASP Top 10 2021 — [A06:2021 Vulnerable and Outdated Components](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/)
- OWASP — [Dependency-Check](https://owasp.org/www-project-dependency-check/)
- [CVE-2024-4367](https://nvd.nist.gov/vuln/detail/CVE-2024-4367) — pdf.js arbitrary JavaScript execution
- [CVE-2023-26136](https://nvd.nist.gov/vuln/detail/CVE-2023-26136) — tough-cookie prototype pollution
- CWE-1104 — [Use of Unmaintained Third Party Components](https://cwe.mitre.org/data/definitions/1104.html)
