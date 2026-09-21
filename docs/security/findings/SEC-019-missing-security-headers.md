# SEC-019 — No security headers, no HTTPS enforcement, no access logging

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 7.4 (`AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N`) |
| OWASP Top 10 2021 | A05:2021 – Security Misconfiguration |
| OWASP ASVS 4.0.3 | V14.4.1–V14.4.7 – HTTP security headers; V9.1.1 – TLS for all client connectivity; V7.1.3 – Security events logged |
| CWE | CWE-693 – Protection Mechanism Failure; CWE-319 – Cleartext Transmission of Sensitive Information |
| Status | Open |
| Affected component | `index.js`, `package.json` |

## Summary

The application sets no HTTP security headers. A search for `helmet`, `hsts`, `csurf`, `sameSite`, `httpOnly` or `secure:` across the codebase returns a single unrelated hit. There is no Content-Security-Policy, no HSTS, no `X-Content-Type-Options`, no `X-Frame-Options` and no `Referrer-Policy`, and Express's `X-Powered-By` banner is left enabled.

The server is created as plain `http.createServer(app)` with no HTTP-to-HTTPS redirect and no HSTS, so downgrade and interception remain possible at the application layer regardless of what a proxy in front may do.

`morgan` is declared as a dependency but is never required anywhere, so there is no access log — only ad-hoc `console.log` calls ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)).

These are individually modest gaps. They are rated High collectively because they remove every containment control that would limit the stored XSS in [SEC-014](SEC-014-unrestricted-file-upload.md), which executes on this same origin.

## Affected code

`index.js:42` — plain HTTP:

```js
const httpServer = http.createServer(app);
```

`index.js:44-104` — the complete middleware stack. `helmet` appears nowhere:

```js
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors(corsOptions));
app.use('/api', apiLimiter);
app.use(express.json());              // :70  duplicate, dead — the 50 MB limit above wins
app.use(routeLogger);
// ... routers ...
app.use('/assets', express.static(path.join(__dirname, 'assets')));
```

`package.json:29` — `morgan` declared; `grep -rn "morgan" --include=*.js . | grep -v node_modules` returns nothing.

No `app.set('trust proxy', ...)` — covered separately in [SEC-020](SEC-020-trust-proxy-and-xff-spoofing.md).

No cookies are used (tokens are Bearer), so cookie flags are not applicable — but neither is there any CSRF protection, which matters for the header-forgery paths in [SEC-009](SEC-009-tenant-isolation-via-client-header.md).

## Technical detail

**Missing header by header:**

| Header | Absent consequence |
|---|---|
| `Content-Security-Policy` | Nothing constrains script execution or exfiltration destinations. The stored XSS in [SEC-014](SEC-014-unrestricted-file-upload.md) runs unimpeded and can `fetch()` any host. |
| `X-Content-Type-Options: nosniff` | Browsers MIME-sniff `/assets` content. A file stored with a benign extension but HTML content may still execute. |
| `Strict-Transport-Security` | A first or post-cache-expiry request can be downgraded to HTTP; the Bearer token travels in clear text. |
| `X-Frame-Options` / `frame-ancestors` | Any site can frame responses. Low impact for a JSON API, but the `/assets` documents are framable. |
| `Referrer-Policy` | URLs containing patient or prescription identifiers leak to third-party hosts via `Referer` when a stored document links outward. |
| `X-Powered-By` removal | Advertises Express, aiding version-specific attack selection. Removed by a single `app.disable('x-powered-by')`. |

**Why CSP matters most here.** `/assets` is served from the same origin as the API, and [SEC-014](SEC-014-unrestricted-file-upload.md) permits storing a `.html` file there. Script in that file executes with the API's origin, can read browser-stored tokens, and can call the API as the victim. A CSP that forbids inline script and restricts `connect-src` would contain that attack even with the upload flaw present. Without it, one upload flaw becomes full session compromise.

**HTTPS.** The public host `https://patientportalapi.akosmd.in` implies TLS terminates at a proxy. That is normal — but the application should still refuse plaintext and emit HSTS, because the application cannot verify the proxy's configuration, and a misconfiguration or a direct-to-origin request bypasses it silently.

**No access log.** Without a request log there is no record of who accessed what and when. Combined with the absence of Socket.IO logging ([SEC-007](SEC-007-socketio-no-authentication.md)) and the absence of a structured audit trail ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)), an intrusion would leave essentially no forensic record — which is itself a HIPAA §164.312(b) failure.

**One positive note:** no debug or health endpoint is exposed. A search for `/health`, `/status`, `/debug`, `/ping`, `/env` returns nothing. The only non-`/api` mount is `/assets`.

## Exploit scenario

**Containment failure**

1. Attacker stores an HTML file via [SEC-014](SEC-014-unrestricted-file-upload.md) at `https://patientportalapi.akosmd.in/assets/patient/2026/<hex>.html`.
2. A clinician opens the link. With no CSP, the inline script executes; with no `nosniff`, even a mistyped `Content-Type` would not prevent it.
3. The script reads the JWT from browser storage and `fetch()`es it to `https://evil.example` — no `connect-src` restriction blocks the request.
4. With a CSP of `default-src 'none'; script-src 'none'; sandbox`, steps 2 and 3 both fail. The upload flaw would remain a bug rather than becoming a breach.

**Downgrade**

5. A clinician on a hostile network types the host without a scheme. The first request goes over HTTP. With no HSTS, the browser has no prior instruction to upgrade, and the `Authorization` header is exposed in transit.

## Remediation

**Step 1 — add `helmet` with an API-appropriate policy.**

```js
const helmet = require('helmet');

app.disable('x-powered-by');

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'none'"],       // a JSON API needs to load nothing
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
}));
```

**Step 2 — apply a stricter policy to `/assets`,** which serves user-supplied content and is the actual XSS surface:

```js
app.use('/assets',
    (req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'attachment');   // download, never render
        next();
    },
    requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR),   // see SEC-023
    express.static(path.join(__dirname, 'assets'), { index: false, dotfiles: 'deny' })
);
```

`Content-Disposition: attachment` alone neutralises stored HTML/SVG XSS, because the browser downloads rather than renders. Combined with the upload allow-list in [SEC-014](SEC-014-unrestricted-file-upload.md), the class is closed twice over.

**Step 3 — enforce HTTPS.**

```js
app.set('trust proxy', 1);            // see SEC-020 — required for req.secure to be meaningful

app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && !req.secure) {
        return res.status(403).json({ message: 'HTTPS required' });   // for an API, refuse rather than redirect
    }
    next();
});
```

Refusing is preferable to redirecting for an API: a redirect invites clients to retry, having already transmitted the credential in clear text.

**Step 4 — add structured access logging.** Either wire up the already-installed `morgan`, or preferably use `pino-http` alongside the redaction work in [SEC-016](SEC-016-credentials-and-phi-in-logs.md):

```js
const pinoHttp = require('pino-http');
app.use(pinoHttp({
    logger,
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[REDACTED]' },
    customLogLevel: (req, res, err) => (res.statusCode >= 500 || err ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
}));
```

**Step 5 — remove the duplicate `express.json()`** at `index.js:70`; it is dead and misleading. Reduce the 50 MB limit while doing so ([SEC-031](SEC-031-cors-and-payload-limits.md)).

**Step 6 — verify headers continuously.** Add an integration test asserting each header is present on a representative response, so a middleware reordering cannot silently drop them.

## Verification

1. **Header check:** `curl -sI https://<host>/api/data/states` shows `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, and **no** `X-Powered-By`.
2. **Assets check:** `curl -sI https://<host>/assets/...` shows `Content-Disposition: attachment` and the restrictive CSP.
3. **XSS containment:** store an HTML file and open it — the browser must download it, not render it.
4. **HTTPS:** an HTTP request to the origin returns 403 in production.
5. **External scan:** [securityheaders.com](https://securityheaders.com) grade improves from F to A.
6. **Access log:** a request produces one structured log line with method, path, status and duration, and no `Authorization` value.
7. **Regression test:** the header integration test fails if `helmet` is removed.

## References

- OWASP — [HTTP Security Response Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- OWASP — [Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [helmet documentation](https://helmetjs.github.io/)
- OWASP ASVS 4.0.3 — V14.4 HTTP Security Headers
- CWE-693 — [Protection Mechanism Failure](https://cwe.mitre.org/data/definitions/693.html)
