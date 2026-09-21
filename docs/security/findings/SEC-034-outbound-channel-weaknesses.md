# SEC-034 — Weak SMTP TLS, HTML injection into email, and parameter injection into the SMS gateway

| Field | Value |
|---|---|
| Severity | **Low** |
| CVSS v3.1 | 4.3 (`AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N`) |
| OWASP Top 10 2021 | A02:2021 – Cryptographic Failures; A03:2021 – Injection |
| OWASP ASVS 4.0.3 | V9.1.2 – Strong TLS configuration; V5.3.3 – Context-aware output encoding; V5.3.10 – Protection against parameter injection |
| CWE | CWE-326 – Inadequate Encryption Strength; CWE-88 – Argument Injection; CWE-79 – Improper Neutralization of Input During Web Page Generation |
| Status | Open |
| Affected component | `helpers/emailHelperSMTP.js`, `controllers/helpController.js`, `controllers/careNavigatorController.js`, `controllers/hrController.js`, `services/smsService.js` |

## Summary

Three defects in the application's outbound communication channels, grouped because they share a remediation owner.

1. **SMTP is configured with `ciphers: 'SSLv3'`** on a STARTTLS port, weakening or breaking encryption for mail that carries OTPs and appointment information.
2. **User-supplied text is interpolated unescaped into outbound HTML emails**, permitting HTML and link injection into internal admin mailboxes.
3. **The SMS gateway URL is built by concatenation without encoding the phone number or template id**, permitting HTTP parameter pollution against the provider.

## Affected code

### SMTP forced to SSLv3 ciphers

`helpers/emailHelperSMTP.js:14-21`:

```js
port: SMTP_PORT,
secure: false,                 // :15  true for 465, false for other ports
...
tls: {
    ciphers: 'SSLv3',          // :21
},
```

### Unescaped user input in outbound HTML email

`controllers/helpController.js:23-37` — `${message}` from `req.body` interpolated into `emailContent` and sent via `emailHelperSMTP`. The same pattern appears at `controllers/careNavigatorController.js:347-360` and `controllers/hrController.js:436-449` and `:550+`.

`validation/helpValidation.js` constrains the field only as `Joi.string().required()` — no maximum length, no sanitisation.

### SMS gateway parameter injection

`services/smsService.js:6`:

```js
const url = `${SMS_API_URL}?apikey=${SMS_API_KEY}&senderid=${SMS_SENDER_ID}&number=${phoneNumber}&pe_id=${SMS_ENTITY_ID}&template_id=${template_id}&message=${encodeURIComponent(message)}&format=json`;
return axios.get(url);
```

`message` is encoded. `phoneNumber` and `template_id` are **not**.

`services/smsService.js:10` and `:18` additionally log the full response and the axios error object — the latter contains `config.url`, which embeds `SMS_API_KEY` ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).

## Technical detail

**`ciphers: 'SSLv3'` is a misconfiguration, not a protocol selection.** In Node's TLS stack this string is passed to OpenSSL as a cipher-list specification. Modern OpenSSL builds have removed the SSLv3-era cipher suites entirely, so the practical outcome is one of two bad ones: either the negotiation fails and mail silently does not send, or it succeeds on a weakened suite. Either way the setting is wrong. With `secure: false` on port 587, the connection relies on STARTTLS, and a constrained cipher list increases the chance of a downgrade or a failure that falls back to plaintext. The mail in question carries password-reset OTPs and appointment details.

**HTML injection into admin mail.** The recipients here are internal staff reading support requests. An attacker submitting `<a href="https://evil.example/login">Click to verify this patient's identity</a>` produces a message that renders as a legitimate link inside an email the staff member expects to receive from the system. This is a well-targeted phishing primitive: the delivery channel is trusted, and the recipient is a privileged user whose credentials are worth more than a patient's. The unbounded length also permits mail-size abuse.

This is HTML injection rather than stored XSS in the application, because the rendering context is a mail client rather than the browser session — but the phishing value is comparable and the fix is the same.

**HTTP parameter pollution against the SMS provider.** `phoneNumber` reaches the URL unencoded. A value containing `&` injects additional query parameters that the gateway may honour, overriding earlier ones depending on its parsing order:

```
phoneNumber = "9999999999&message=Your%20account%20is%20suspended,%20call%20+1555…&senderid=CLINIC"
```

The attacker controls the message body and potentially the sender id — sending arbitrary SMS from the organisation's account, at its expense, with its sender identity. Phone numbers are attacker-settable through the profile update paths ([SEC-013](SEC-013-mass-assignment.md)).

This is not full SSRF: `SMS_API_URL` comes from the environment, so the host cannot be redirected. The injection is confined to the query string.

## Exploit scenario

**Phishing internal staff**

1. Attacker submits a support request containing crafted HTML with a link to a credential-harvesting page styled as the internal portal.
2. The message is emailed to staff and renders as HTML.
3. A staff member follows the link and submits credentials. Given [SEC-001](SEC-001-broken-role-enforcement.md), a single staff credential reaches every tenant's data.

**SMS abuse**

4. Attacker sets their profile phone number to a value containing `&message=…&senderid=…`.
5. They trigger any flow that sends an SMS.
6. The gateway receives the injected parameters and sends an attacker-authored message under the organisation's sender id — usable for fraud against patients who will reasonably trust the sender.

**Mail interception**

7. On a network path where STARTTLS can be stripped or downgraded, an OTP email is exposed in transit.

## Impact

- **Confidentiality:** OTPs and appointment details potentially exposed in transit; SMS API key disclosed in logs.
- **Integrity:** attacker-authored email to internal staff and SMS from the organisation's sender identity.
- **Reputation and financial:** messages sent under the clinic's identity; provider costs incurred by the attacker.
- Rated Low individually; the staff-phishing path is the element most worth prioritising, because of what a staff credential unlocks.

## Remediation

**Step 1 — fix the TLS configuration.**

```js
// helpers/emailHelperSMTP.js
const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,      // implicit TLS on 465, STARTTLS otherwise
    requireTLS: true,                        // refuse to send if STARTTLS is unavailable
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,            // verify the server certificate
        // No `ciphers` override — Node's defaults are correct and stay current.
    },
});
```

`requireTLS: true` is the key line: it makes a downgrade a delivery failure rather than a silent plaintext send.

**Step 2 — escape user input in email templates.** Use the same helper as [SEC-015](SEC-015-html-injection-puppeteer-pdf.md):

```js
const emailContent = `
    <p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
    <p><strong>Message:</strong></p>
    <pre>${escapeHtml(message)}</pre>
`;
```

Better still, adopt a template engine with automatic escaping, and send a plaintext alternative — a plaintext part cannot carry a disguised link at all. Constrain the field in `validation/helpValidation.js`:

```js
message: Joi.string().trim().min(1).max(5000).required(),
```

**Step 3 — build the SMS URL with a proper encoder.** Never concatenate query strings:

```js
// services/smsService.js
const sendSms = (phoneNumber, message, templateId) => {
    const normalised = String(phoneNumber).replace(/[^\d+]/g, '');      // digits and + only
    if (!/^\+?\d{8,15}$/.test(normalised)) {
        throw new AppError('Invalid phone number', 400);
    }
    if (!/^\d+$/.test(String(templateId))) {
        throw new AppError('Invalid template id', 400);
    }

    const url = new URL(SMS_API_URL);
    url.searchParams.set('apikey', SMS_API_KEY);        // URLSearchParams encodes every value
    url.searchParams.set('senderid', SMS_SENDER_ID);
    url.searchParams.set('number', normalised);
    url.searchParams.set('pe_id', SMS_ENTITY_ID);
    url.searchParams.set('template_id', String(templateId));
    url.searchParams.set('message', message);
    url.searchParams.set('format', 'json');

    return axios.get(url.toString(), { timeout: 10_000 });
};
```

`URLSearchParams` encodes every value, which removes the whole class rather than patching the two known-bad parameters. Prefer POST with the credential in a header if the provider supports it — a key in a query string ends up in provider logs and proxy logs.

**Step 4 — remove the logging** at `smsService.js:10` and `:18` that prints the response and the axios error containing the API key ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).

**Step 5 — validate phone numbers at input.** Enforce the format in the profile update schema so a malformed number never reaches storage, and close the mass-assignment path that allows setting it arbitrarily ([SEC-013](SEC-013-mass-assignment.md)).

**Step 6 — configure SPF, DKIM and DMARC** for the sending domain, so injected or spoofed mail purporting to come from the clinic is rejected by recipients.

## Verification

1. **TLS:** send a test email and confirm the negotiated connection is TLS 1.2 or higher with a modern cipher; confirm delivery **fails** when the server offers no STARTTLS.
2. **HTML injection:** submit `<b>x</b><a href="https://evil.example">click</a>` as a support message and confirm the received email shows the literal text.
3. **Length:** submit a 10 MB message and confirm a 400.
4. **SMS injection:** set a phone number containing `&message=injected` and confirm it is rejected at validation, and that the outbound URL contains only the intended parameters.
5. **Encoding:** log the constructed URL in a test environment (never production) and confirm every value is percent-encoded.
6. **Key leakage:** trigger an SMS failure and confirm no `apikey` value appears in any log.
7. **Email authentication:** confirm SPF, DKIM and DMARC records resolve and pass for the sending domain.

## References

- OWASP — [Transport Layer Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Protection_Cheat_Sheet.html)
- OWASP — [Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- Nodemailer — [TLS options](https://nodemailer.com/smtp/)
- CWE-88 — [Improper Neutralization of Argument Delimiters in a Command](https://cwe.mitre.org/data/definitions/88.html)
