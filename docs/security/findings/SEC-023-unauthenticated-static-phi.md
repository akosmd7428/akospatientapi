# SEC-023 — Patient documents served without authentication, and committed to git

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`) |
| OWASP Top 10 2021 | A01:2021 – Broken Access Control |
| OWASP ASVS 4.0.3 | V4.1.1 – Access controls enforced on a trusted service layer; V12.5.2 – Files not served from a directory with direct access; V8.1.1 – Sensitive data protected from unauthorised access |
| CWE | CWE-552 – Files or Directories Accessible to External Parties; CWE-425 – Direct Request ("Forced Browsing"); CWE-540 – Inclusion of Sensitive Information in Source Code |
| Status | Open |
| Affected component | `index.js`, `assets/`, git repository |

## Summary

`index.js:101` serves the entire `assets/` directory as public static content with no authentication. That directory holds patient documents: prescription PDFs, lab reports, uploaded medical images, chat attachments and clinician signatures. The only protection is that filenames are 32-character hex strings — security through obscurity, and not even reliably so, since some files use predictable timestamp-based names.

Independently and more seriously, **568 of these files are committed to the git repository**, including 367 prescription PDFs, 35 reports, 41 patient documents and 60 chat attachments. PHI is therefore present in source control history, distributed to every clone, and subject to the same repository-visibility question as [SEC-010](SEC-010-committed-third-party-credentials.md).

## Affected code and inventory

`index.js:101`:

```js
app.use('/assets', express.static(path.join(__dirname, 'assets')));
```

No middleware precedes it on that path. `express.static` serves any file under the directory to any requester.

**Committed PHI, measured directly from the git index:**

```
$ git ls-files assets | wc -l
568

assets/prescriptions   367 files    prescription PDFs
assets/chat             60 files    chat attachments
assets/patient          41 files    uploaded patient documents and images
assets/report           35 files    lab / diagnostic reports
assets/prescription     24 files
assets/signature        10 files    clinician signature images
assets/careNavigator     6 files
assets/2024/7/…                     profile photographs
```

Sample paths (filenames only; contents not reproduced here):

```
assets/patient/2024/115ec645b8000f32c575f5473f8a1c51.jpeg
assets/prescriptions/prescription_<id>.pdf
assets/report/…
```

**Predictable names.** Two naming schemes are in use. Uploads via `services/dataService.js:90` use `crypto.randomBytes(16)` — 128 bits, not guessable. But `helpers/generatePdf.js:6` uses `prescription_${prescriptionUniqueId}.pdf`, and those identifiers are generated with `Math.random()` ([SEC-018](SEC-018-insecure-randomness.md)). Profile images use millisecond timestamps (`profile_1721978740737.jpg`), which are enumerable across a narrow window.

`.gitignore:19` lists `uploads/` — but the directory actually used is `assets/`, which is not ignored. That appears to be the origin of the leak.

## Technical detail

**Unauthenticated access.** Anyone holding or guessing a URL retrieves the document. URLs leak readily: they are emailed to patients (`helpers/generatePrescription.js:257`), stored in the database, written into the `logs` table ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)), and — with no `Referrer-Policy` ([SEC-019](SEC-019-missing-security-headers.md)) — transmitted to any third-party host a document links to. An email forwarded once exposes the document permanently, with no revocation possible.

**Obscurity is not uniform.** For randomly named uploads, guessing is infeasible. For prescription PDFs, the identifier comes from `Math.random()`, whose state is recoverable — so those 367 documents are enumerable in principle. Profile images with millisecond timestamps are enumerable in practice.

**No access control even in principle.** Because `express.static` runs before any authorisation logic, there is no point at which the application can ask "should *this* user see *this* patient's document?" The control does not exist to be bypassed.

**PHI in git is the harder problem.** Unlike a served file, which can be protected by adding middleware, committed files are in history. Every clone — current staff, former staff, contractors, CI caches, forks — holds copies. Removing them from `HEAD` does not remove them from history. If the repository is public, these 568 files have been world-readable for the life of the repository.

This is also a records-management failure: PHI in a source repository is outside any retention, access-logging or deletion process. A patient exercising a right to erasure cannot be satisfied for data in git history without rewriting it.

**Directory listing.** `express.static` does not list directories by default, which limits casual browsing — but it does serve dotfiles unless `dotfiles: 'deny'` is set, so a stray `assets/.env` or `assets/.git` would be retrievable.

## Exploit scenario

**Repository access**

1. Anyone with repository access — a former contractor, a fork, or the public if the repository is public — runs `git clone`.
2. `assets/prescriptions/` yields 367 prescription PDFs containing patient names, diagnoses, medications and dosages. No exploitation was required; the data is simply in the repository.

**URL disclosure**

3. A patient forwards a prescription email to an insurer or family member. The recipient — and anyone the message later reaches — can retrieve the document indefinitely. There is no expiry and no revocation.

**Enumeration**

4. Attacker recovers the `Math.random()` state ([SEC-018](SEC-018-insecure-randomness.md)) and generates candidate prescription identifiers.
5. `GET /assets/prescriptions/prescription_<id>.pdf` for each candidate. Successful requests return other patients' prescriptions, unauthenticated.
6. For profile images, iterating timestamps around a known upload time is simpler still.

**Combined with the upload flaw**

7. [SEC-014](SEC-014-unrestricted-file-upload.md) permits storing an HTML file here, which this same static mount then serves as executable content on the API origin.

## Impact

- **Confidentiality:** unauthenticated retrieval of prescriptions, lab reports, medical images and chat attachments. Committed history exposes 568 such files to every clone holder.
- **Irrevocability:** URLs cannot be expired; git history cannot be un-distributed.
- **Compliance:** HIPAA §164.312(a)(1) access control and §164.312(b) audit controls — document access is neither restricted nor logged. §164.502(b) minimum necessary is unmet. PHI in a source repository is outside every retention and erasure process.
- **Breach assessment:** if the repository is public, this likely constitutes a reportable disclosure on its own, independent of the credential exposure in [SEC-010](SEC-010-committed-third-party-credentials.md).

## Remediation

**Step 1 — remove PHI from the repository and stop it recurring.**

```bash
# 1. Confirm the files exist on the server filesystem / in backups before removing from git.
# 2. Stop tracking them (keeps the working-tree copies):
git rm -r --cached assets/patient assets/prescription assets/prescriptions \
                   assets/report assets/chat assets/signature assets/careNavigator assets/2024
```

```diff
--- a/.gitignore
 uploads/
+# Patient documents — PHI. Never commit.
+assets/patient/
+assets/prescription/
+assets/prescriptions/
+assets/report/
+assets/chat/
+assets/signature/
+assets/careNavigator/
+assets/2024/
+!assets/akosLogo.png
```

Then scrub history, coordinated with the credential scrub in [SEC-010](SEC-010-committed-third-party-credentials.md) so the rewrite happens once:

```bash
git filter-repo --path assets/prescriptions --path assets/patient --path assets/report \
                --path assets/chat --path assets/signature --path assets/careNavigator --invert-paths
git push --force --all
```

Every collaborator must re-clone. Record this as a data-handling incident and assess notification obligations.

**Step 2 — replace `express.static` with an authorised handler.**

```js
const { requireAuth, ROLES } = require('./middleware/requireAuth');
const { assertCanAccessDocument } = require('./helpers/authorization');

app.get('/assets/:category/:year/:filename',
    requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR),
    async (req, res) => {
        const { category, year, filename } = req.params;

        // Resolve the document record first — authorisation is on the record, not the path.
        const doc = await DocumentService.findByStoredName(filename);
        if (!doc) return res.sendStatus(404);

        await assertCanAccessDocument(req.user, doc);      // throws 403 — see SEC-011
        await auditLog('phi_document_accessed', {          // required by HIPAA §164.312(b)
            actorId: req.user.id, documentId: doc.id, subjectPatientId: doc.patientId,
        });

        const root = path.resolve(__dirname, 'assets');
        const file = path.resolve(root, category, year, filename);
        if (!file.startsWith(root + path.sep)) return res.sendStatus(400);   // containment check

        res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        return res.sendFile(file);
    }
);
```

Authorising on the **document record** rather than the path is the important detail: it ties access to the owning patient, which is what the authorisation helper needs.

**Step 3 — prefer object storage with signed URLs.** Move documents to S3 or Azure Blob on a separate domain, private by default, issuing short-lived (5–15 minute) signed URLs after the same authorisation check. This removes the documents from the application origin entirely, which also neutralises the stored-XSS path in [SEC-014](SEC-014-unrestricted-file-upload.md), and gives per-object access logging for free.

**Step 4 — stop emailing durable links.** Email a link to an authenticated portal page rather than a direct document URL, so access requires a session. If the PDF must be attached, attach it — a forwarded attachment is at least a discrete disclosure rather than a permanent open endpoint.

**Step 5 — unguessable names everywhere.** Replace `prescription_${id}.pdf` with a `crypto.randomBytes(16)` stored name ([SEC-018](SEC-018-insecure-randomness.md)), keeping the human-readable name only in the database for the `Content-Disposition` header. This is defence in depth — it does not substitute for Step 2.

## Verification

1. **Anonymous access:** `curl -I https://<host>/assets/prescriptions/<known>.pdf` returns **401**. Before the fix it returns 200 with the PDF.
2. **Cross-patient:** authenticated as patient A, request patient B's document. Must return 403.
3. **Audit:** each successful document retrieval writes exactly one audit record naming actor, document and subject patient.
4. **Traversal:** `GET /assets/../config/secret.js` must return 400/404.
5. **Headers:** confirm `Content-Disposition: attachment`, `nosniff`, `no-store` and the sandbox CSP.
6. **Git:** `git ls-files assets | wc -l` returns only non-PHI assets (the logo); after the history rewrite, `git log --all --name-only -- assets/prescriptions` returns nothing.
7. **Recurrence:** attempt to commit a file under `assets/patient/` and confirm `.gitignore` prevents it.

## References

- OWASP Top 10 2021 — [A01:2021 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- OWASP — [File Upload Cheat Sheet: file storage and retrieval](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- HIPAA Security Rule §164.312(a)(1), §164.312(b)
- CWE-552 — [Files or Directories Accessible to External Parties](https://cwe.mitre.org/data/definitions/552.html)
