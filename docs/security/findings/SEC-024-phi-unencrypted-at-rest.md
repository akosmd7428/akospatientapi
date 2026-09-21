# SEC-024 — PHI stored unencrypted at rest with no retention policy

| Field | Value |
|---|---|
| Severity | **Medium** |
| CVSS v3.1 | 6.5 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`) |
| OWASP Top 10 2021 | A02:2021 – Cryptographic Failures |
| OWASP ASVS 4.0.3 | V8.1.6 – Sensitive data stored encrypted at rest; V8.3.4 – Sensitive data inventoried and retention defined; V6.1.1 – Regulated private data stored encrypted |
| CWE | CWE-311 – Missing Encryption of Sensitive Data; CWE-359 – Exposure of Private Personal Information |
| Status | Open |
| Affected component | `models/patientModel.js`, `models/logsModel.js`, `models/patientDetailModel.js` |

## Summary

Patient identifiers and clinical data are stored as plain columns with no field-level encryption, and the `logs` table holds raw request bodies with no timestamp and therefore no possible retention policy.

The notable feature of this finding is its asymmetry with the rest of the codebase. The application goes to considerable effort to encrypt PHI **in transit at the application layer** — an effort that is ineffective because the key is committed and a public oracle decrypts it ([SEC-004](SEC-004-hardcoded-aes-key-static-iv.md), [SEC-005](SEC-005-public-crypto-oracle-endpoints.md)) — while storing the same PHI **unencrypted at rest** and **unencrypted in a log table**. Effort was spent on the weaker control and not on the stronger one.

## Affected code

`models/patientModel.js:19-63` — identifiers and demographics as plain strings:

```js
first_name:   { type: DataTypes.STRING },
last_name:    { type: DataTypes.STRING },
email:        { type: DataTypes.STRING },
dateofbirth:  { type: DataTypes.STRING },
address1:     { type: DataTypes.STRING },
gender:       { type: DataTypes.STRING },
phone:        { type: DataTypes.STRING },
city:         { type: DataTypes.STRING },
state:        { type: DataTypes.STRING },
zip_code:     { type: DataTypes.STRING },
password:     { type: DataTypes.STRING },      // :32  MD5 — see SEC-003
```

There is **no `defaultScope` excluding `password`**, so `Patient.findOne` returns the hash on every lookup. Those objects are then passed to `console.log` ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)) and returned by the SSO login path at `controllers/authController.js:285`.

`models/logsModel.js:30,40`:

```js
additionalData: { type: DataTypes.JSON },     // :30  raw request bodies
...
{ tableName: 'logs', timestamps: false }      // :40  no createdAt
```

Without `createdAt` there is no column on which to base a purge, so the table accumulates PHI indefinitely.

**Scope note.** `models/dataModel.js` holds clinical *reference* data only — medication, symptom, allergy and vaccination catalogues, plus cities and states. It is not itself a PHI store, though `Medication`, `HealthProblem`, `Symptom` and `Allergy` (lines 4-36) are the vocabularies joined to patient records elsewhere.

No national-identifier column (Emirates ID or equivalent) was found in `models/` — a grep returns nothing. The identifiers in scope are name, date of birth, phone, email, address and clinical history.

## Technical detail

**What "encryption at rest" needs to mean here.** Full-disk or storage-volume encryption — if configured at the infrastructure level, which this audit could not verify — protects against physical media theft and nothing else. It does not protect against the threat this application actually faces: SQL injection ([SEC-006](SEC-006-sql-injection.md)), a `root`-with-empty-password database account ([SEC-030](SEC-030-database-root-empty-password.md)), a leaked backup, or an over-privileged operator. In all of those, the database serves decrypted data by design.

Protecting against them requires **application-level encryption of the most sensitive fields**, with keys held outside the database. Then a database dump yields ciphertext, and the attacker additionally needs the key from the application's environment or KMS.

**This cannot be applied indiscriminately.** Encrypting a column removes the ability to index, sort or range-query it. The practical approach is selective:

| Field | Treatment | Why |
|---|---|---|
| `email` | Deterministic encryption or a blind index (HMAC of the normalised value) | Must support exact-match lookup at login |
| `phone`, `dateofbirth`, `address1` | Randomised AEAD encryption | Read after lookup; never searched |
| Clinical notes, diagnoses, medications | Randomised AEAD encryption | Free text, never searched directly |
| `password` | Already a hash — needs bcrypt, not encryption ([SEC-003](SEC-003-unsalted-md5-passwords.md)) | Hashing, not encryption, is correct here |
| `first_name`, `last_name` | Consider leaving plain | Heavily searched (`chatService.js:39` uses `LIKE`); encrypting breaks that. Accept and compensate with access control. |

Deterministic encryption leaks equality, which is why it is acceptable for `email` (already effectively an identifier) and not for clinical fields.

**Retention.** HIPAA §164.316(b)(2) requires six-year retention of *documentation*; it does not require indefinite retention of raw request logs, and §164.502(b) minimum necessary argues against it. The `logs` table should have a short diagnostic retention window, and the separate audit trail ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)) the longer one.

## Exploit scenario

1. Attacker exploits [SEC-006](SEC-006-sql-injection.md) or obtains the `root`/empty-password database connection ([SEC-030](SEC-030-database-root-empty-password.md)).
2. `SELECT * FROM patient` returns names, dates of birth, emails, phone numbers, addresses and MD5 password hashes in plain text.
3. `SELECT additionalData FROM logs` returns the historical archive of request bodies — with no retention limit, this may span the platform's entire operational life.
4. With field-level encryption in place, steps 2 and 3 would return ciphertext, and the attacker would additionally need the key from the application environment or KMS — a second, separate compromise.
5. A leaked or misconfigured database backup produces the same outcome with no application compromise at all.

## Impact

- **Confidentiality:** any database-level compromise yields the complete PHI corpus in clear text, with no additional barrier.
- **Breach scope:** unencrypted PHI removes the safe-harbour consideration in breach assessment. Encrypted data that an attacker cannot decrypt substantially narrows notification obligations; plaintext does not.
- **Retention:** unbounded accumulation in `logs` widens the blast radius of any future incident.
- **Compliance:** HIPAA §164.312(a)(2)(iv) addressable encryption at rest — "addressable" requires documenting why an alternative is reasonable, and no such documentation exists here.

## Remediation

**Step 1 — inventory the data.** Before encrypting anything, produce a data map: every table and column holding PHI or PII, its purpose, who may read it, how long it is retained. This is required for a HIPAA risk analysis in any case, and it is what determines which columns are worth encrypting.

**Step 2 — add a `defaultScope` excluding `password` (do this first; it is a few lines).**

```js
// models/patientModel.js
const Patient = sequelizeDB1.define('patient', { /* ... */ }, {
    defaultScope: { attributes: { exclude: ['password'] } },
    scopes: { withPassword: { attributes: {} } },   // opt in explicitly, only in the auth path
});

// The only place that needs it:
const user = await Patient.scope('withPassword').findOne({ where: { email } });
```

This immediately stops the hash reaching logs and API responses.

**Step 3 — field-level encryption for the high-sensitivity columns.**

```js
// helpers/fieldCrypto.js
const crypto = require('crypto');
const KEY = Buffer.from(process.env.FIELD_ENC_KEY, 'hex');   // from KMS, never from source

function encryptField(plaintext) {
    if (plaintext == null) return null;
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const ct = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

function decryptField(stored) {
    if (stored == null) return null;
    const buf = Buffer.from(stored, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

// Blind index for searchable-but-encrypted fields.
const blindIndex = (v) => crypto.createHmac('sha256', BLIND_KEY)
                                .update(String(v).trim().toLowerCase()).digest('hex');
```

Apply transparently with Sequelize getters and setters:

```js
phone: {
    type: DataTypes.TEXT,
    get() { return decryptField(this.getDataValue('phone')); },
    set(v) { this.setDataValue('phone', encryptField(v)); },
},
email: {
    type: DataTypes.TEXT,
    get() { return decryptField(this.getDataValue('email')); },
    set(v) {
        this.setDataValue('email', encryptField(v));
        this.setDataValue('email_bidx', blindIndex(v));   // lookup column
    },
},
```

Login then queries `where: { email_bidx: blindIndex(inputEmail) }`.

**Step 4 — key management.** Keys in a KMS or vault, never in source ([SEC-010](SEC-010-committed-third-party-credentials.md)) and ideally not in `.env` ([SEC-032](SEC-032-secret-sprawl-working-tree.md)). Plan for rotation: store a key version alongside each ciphertext so old values remain readable during re-encryption.

**Step 5 — fix the `logs` table.** Add `createdAt`, stop storing request bodies ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)), implement a purge job, and move it to a separate datastore with separate credentials.

**Step 6 — verify infrastructure encryption** as a complementary control: MySQL at-rest encryption or encrypted EBS/managed-disk volumes, encrypted backups, and TLS on the database connection (`config/sequelize.js` currently specifies no `ssl` option — worth confirming the connection is not plaintext across the network).

**Step 7 — migrate existing rows** in a controlled backfill, verifying decryption round-trips before dropping the plaintext columns.

## Verification

1. **Password scope:** `Patient.findOne(...)` returns an object with no `password` property; only the explicit `withPassword` scope includes it.
2. **Column inspection:** `SELECT phone, dateofbirth FROM patient LIMIT 5;` returns base64 ciphertext, not readable values.
3. **Round-trip:** the application reads and writes those fields correctly through the getters and setters.
4. **Login:** email lookup via blind index still authenticates correctly.
5. **Key separation:** confirm `FIELD_ENC_KEY` is not present in the database, in source, or in any backup of the database.
6. **Retention:** `logs` has a `createdAt` column and the purge job removes rows past the policy window.
7. **Transport:** confirm the application-to-database connection uses TLS.

## References

- OWASP — [Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V8 Data Protection Verification Requirements
- HIPAA Security Rule §164.312(a)(2)(iv) — Encryption and Decryption
- CWE-311 — [Missing Encryption of Sensitive Data](https://cwe.mitre.org/data/definitions/311.html)
