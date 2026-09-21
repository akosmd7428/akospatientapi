# SEC-020 — `trust proxy` unset and `X-Forwarded-For` trusted: rate limiting and IP allow-listing both defeated

| Field | Value |
|---|---|
| Severity | **High** |
| CVSS v3.1 | 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:L`) |
| OWASP Top 10 2021 | A05:2021 – Security Misconfiguration; A07:2021 – Identification and Authentication Failures |
| OWASP ASVS 4.0.3 | V13.2.3 – Protection against automated abuse; V11.1.4 – Anti-automation controls; V1.4.1 – Trusted enforcement points |
| CWE | CWE-348 – Use of Less Trusted Source; CWE-807 – Reliance on Untrusted Inputs in a Security Decision; CWE-290 – Authentication Bypass by Spoofing |
| Status | Open |
| Affected component | `index.js`, `helpers/commonHelper.js`, `controllers/authController.js` |

## Summary

Two related defects stem from how the application handles client IP addresses behind its reverse proxy.

First, `app.set('trust proxy', ...)` is never called. Express therefore reports the **proxy's** address as `req.ip` for every request, so `express-rate-limit` places all traffic from all users into a single shared bucket. The limiter simultaneously fails to restrict any individual attacker and threatens to lock out all legitimate users once the shared counter fills.

Second, and more seriously, the SSO IP allow-list reads the `X-Forwarded-For` header directly and unconditionally. Because the header is attacker-controlled on a direct request, the `api_ip_restriction` control is bypassed by sending one header with an allowed value.

A third, smaller issue: the allow-list silently disables itself if any entry contains `*`.

## Affected code

**No `trust proxy`** — the setting appears nowhere in `index.js`. The limiter at `index.js:58-67`:

```js
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,                      // comment says 100; the code says 1000
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', apiLimiter);
```

`express-rate-limit` keys on `req.ip`. Without `trust proxy`, `req.ip` is the proxy's address for every request.

**`X-Forwarded-For` trusted for a security decision** — `helpers/commonHelper.js:109-115`:

```js
const forwarded = req.headers['x-forwarded-for'];
if (forwarded) {
    ip = forwarded.split(',')[0].trim();        // first value — the most attacker-controllable position
}
```

Consumed at `controllers/authController.js:192`:

```js
CommonHelper.isIpWhitelisted(clientIp, company.api_ip_whitelist)
```

**Wildcard disables the control** — `helpers/commonHelper.js:136`:

```js
if (allowedIps.includes('*')) return true;
```

## Technical detail

**Why the limiter is ineffective.** In a `client → proxy → Node` topology, the TCP peer Node observes is the proxy. Express exposes the real client address only when `trust proxy` is configured, so that it knows how many hops to skip in `X-Forwarded-For`. Unset, `req.ip` is constant, and a 1000-request budget is shared platform-wide. An attacker consumes it alone; legitimate users then receive 429s. The control is worse than absent — it is a denial-of-service lever.

**Why `X-Forwarded-For` cannot be trusted as written.** The header is a client-supplied hint. A correctly configured proxy *appends* the real peer address, so the **rightmost** entries are trustworthy and the leftmost are whatever the client sent. This code takes `split(',')[0]` — the **leftmost**, which is precisely the attacker-controlled position.

Worse, if the origin is reachable directly (a common misconfiguration where the host has a public IP alongside the proxy), there is no proxy to append anything, and the header is entirely attacker-authored.

The consequence is that `api_ip_restriction` — a control a customer presumably requested and may be contractually relying on — is bypassed by one header. The customer believes SSO access is restricted to their corporate network; in practice it is open to anyone who sets `X-Forwarded-For` to an address in their range.

**Setting `trust proxy` alone is not sufficient.** It must be set to the *correct* value. `app.set('trust proxy', true)` trusts the entire chain and reintroduces spoofing. The value must be the precise number of proxies in front of the application, or an explicit list of proxy addresses.

**The wildcard branch.** `allowedIps.includes('*')` returning `true` means a single `*` entry — added for testing, or during onboarding — silently disables the restriction for that company, with no warning and no log.

## Exploit scenario

**Bypassing the SSO IP restriction**

1. A company is configured with `api_ip_restriction` enabled and `api_ip_whitelist` containing their office range.
2. Attacker obtains the `client_id` and `client_secret` — from the `logs` table ([SEC-016](SEC-016-credentials-and-phi-in-logs.md)), from a `console.log` at `authController.js:205`, or from any other leak.
3. Attacker calls the SSO endpoint from anywhere, adding:
   ```
   X-Forwarded-For: 203.0.113.10
   ```
   where `203.0.113.10` is any address in the company's allow-list.
4. `getClientIp` returns the spoofed value, `isIpWhitelisted` returns true, and authentication proceeds. The network restriction the customer relies on is bypassed with one header.

**Defeating the rate limiter**

5. Because all traffic shares one bucket, the attacker's brute-force attempts against `/api/auth/login` ([SEC-021](SEC-021-insufficient-anti-automation.md)) are not individually limited.
6. Conversely, the attacker can send 1000 requests in a burst and trigger a 429 for **every** user of the platform — a trivial denial of service.

## Impact

- **Confidentiality:** IP-based SSO restriction bypassed; a contractually promised control is ineffective.
- **Availability:** any single client can exhaust the shared rate-limit budget and lock out all users.
- **Detection:** logged client IPs are either the proxy's address or attacker-chosen values, so incident logs are unreliable for attribution.
- **Compounding:** this is the reason the limiter does not mitigate the brute-force exposure in [SEC-021](SEC-021-insufficient-anti-automation.md).

## Remediation

**Step 1 — set `trust proxy` to the exact topology.**

```js
// index.js — before any middleware that reads req.ip
app.set('trust proxy', 1);            // exactly one proxy (nginx / ALB) in front
```

If the number of hops varies, enumerate the proxies explicitly instead:

```js
app.set('trust proxy', ['10.0.0.0/8', '172.16.0.0/12']);   // known proxy ranges only
```

Never `true` — it trusts the whole chain and restores the spoofing problem.

**Step 2 — derive the client IP from Express, not from the raw header.**

```js
// helpers/commonHelper.js
function getClientIp(req) {
    return req.ip;      // Express applies the trust-proxy setting correctly
}
```

Delete the manual `x-forwarded-for` parsing at `:109-115` entirely. Express already implements the hop-counting logic; reimplementing it is how the leftmost-entry bug arose.

**Step 3 — ensure the proxy overwrites rather than appends.** Application-side configuration is only half the fix; the proxy must not forward a client-supplied header verbatim:

```nginx
# nginx
proxy_set_header X-Forwarded-For $remote_addr;    # overwrite, not $proxy_add_x_forwarded_for
proxy_set_header X-Real-IP       $remote_addr;
```

Also confirm the origin is not reachable directly — it should accept connections only from the proxy's security group or firewall rule. This is the control that actually guarantees the header cannot be forged.

**Step 4 — remove the wildcard bypass and fail closed.**

```js
function isIpWhitelisted(clientIp, allowedList) {
    const entries = parseList(allowedList);
    if (entries.length === 0) {
        logger.warn({ event: 'ip_allowlist_empty' });
        return false;                         // fail closed — empty list permits nothing
    }
    if (entries.some(e => e === '*')) {
        logger.error({ event: 'ip_allowlist_wildcard', detail: 'wildcard entry disables the control' });
        return false;                         // refuse to honour a wildcard
    }
    return entries.some(entry => ipRangeCheck(clientIp, entry));   // CIDR-aware
}
```

Use a maintained library such as `ip-range-check` rather than string comparison, so CIDR notation and IPv6 are handled correctly.

**Step 5 — layer the rate limiting** (detail in [SEC-021](SEC-021-insufficient-anti-automation.md)): a strict per-IP and per-account limiter on authentication endpoints, and a shared-store backend (Redis) so limits hold across instances.

**Step 6 — add a startup assertion** that `trust proxy` is configured in production, so a future refactor cannot silently drop it.

## Verification

1. **IP resolution:** log `req.ip` for a request from a known external address and confirm it is the real client address, not the proxy's.
2. **Spoof test:** send `X-Forwarded-For: 203.0.113.10` from an address outside the allow-list. SSO must be **rejected**. Before the fix it succeeds.
3. **Direct-origin test:** attempt to connect to the origin's address directly, bypassing the proxy. The connection must be refused at the network layer.
4. **Rate-limit isolation:** exhaust the limit from client A and confirm client B is unaffected. Before the fix, B is locked out.
5. **Wildcard test:** set a company's allow-list to `*` and confirm access is **denied** and an error is logged.
6. **Empty-list test:** set an empty allow-list with restriction enabled and confirm access is denied.
7. **CIDR test:** confirm `10.0.0.0/24` correctly admits `10.0.0.5` and rejects `10.0.1.5`.

## References

- Express — [Behind proxies (`trust proxy`)](https://expressjs.com/en/guide/behind-proxies.html)
- `express-rate-limit` — [Troubleshooting proxy issues](https://express-rate-limit.mintlify.app/guides/troubleshooting-proxy-issues)
- OWASP ASVS 4.0.3 — V13.2 RESTful Web Service; V11.1 Business Logic Security
- CWE-348 — [Use of Less Trusted Source](https://cwe.mitre.org/data/definitions/348.html)
