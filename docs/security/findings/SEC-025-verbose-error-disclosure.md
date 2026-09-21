# SEC-025 — Raw exception messages returned to clients

| Field | Value |
|---|---|
| Severity | **Medium** |
| CVSS v3.1 | 5.3 (`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`) |
| OWASP Top 10 2021 | A05:2021 – Security Misconfiguration |
| OWASP ASVS 4.0.3 | V7.4.1 – Generic message shown on unexpected errors; V7.4.3 – Exception handling across the codebase |
| CWE | CWE-209 – Generation of Error Message Containing Sensitive Information |
| Status | Open |
| Affected component | `index.js`, all controllers, Socket.IO handlers |

## Summary

Raw `error.message` values are returned to clients at approximately 180 call sites, plus nine Socket.IO callbacks. Sequelize places table names, column names, constraint names and dialect-specific detail into those messages, so the database schema is disclosed to any caller who can provoke an error.

**Stack traces are not sent** — a search confirms `res.json`/`res.send` is never called with `err.stack`, and `middleware/errorHandler.js:11` extracts a stack frame only for the database log. That limits the severity. Raw database messages are still disclosed.

## Affected code

`index.js:97-99` — the global handler forwards the message verbatim:

```js
app.use((err, req, res, next) => {
    CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, err.message);
});
```

Representative controller sites — the pattern repeats roughly 180 times:

```js
// controllers/authController.js:25, 92, 107, 132
return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);

// controllers/forgotPasswordController.js:32
CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
```

Socket.IO callbacks do the same over the WebSocket, where no HTTP error handling applies at all:

```
index.js:167, 200, 211, 221, 232, 272, 338, 366, 388
    callback({ success: false, error: error.message });
```

Errors thrown inside `middleware/validateDataEncryption.js:15-22` — which has no try/catch and no null guard — propagate to `index.js:98` and disclose `crypto` internals ([SEC-029](SEC-029-decryption-middleware-defects.md)).

## Technical detail

**What Sequelize leaks.** A constraint violation produces messages such as `Duplicate entry 'x@y.com' for key 'patient.email_UNIQUE'` — disclosing the table name, the column name and the index name. A type error discloses column types. A malformed query discloses fragments of the SQL. Collectively, an attacker can reconstruct much of the schema by provoking errors, which materially accelerates exploitation of the SQL injection in [SEC-006](SEC-006-sql-injection.md): knowing exact table and column names removes the blind-extraction phase entirely.

**Business-logic messages leak too.** `services/forgotPasswordService.js:34,44,54,68` produce role-specific messages ("No Care Navigator found with this email") that are surfaced verbatim by `forgotPasswordController.js:12`. That is the account-enumeration oracle documented in [SEC-028](SEC-028-account-enumeration.md) — the same mechanism, a different consequence.

**Error-path discrimination.** Distinguishable errors from the decryption middleware — padding failure versus JSON parse failure — are exactly the signal a CBC padding-oracle attack needs ([SEC-029](SEC-029-decryption-middleware-defects.md)).

**Not all messages are unsafe.** "Invalid email or password" and "This appointment slot is unavailable" are intentional and useful. The fix is not to suppress everything; it is to distinguish messages the application *authored* for the client from messages a *library* produced for a developer.

## Exploit scenario

1. Attacker submits a registration with an email that already exists.
2. Response: `Duplicate entry 'victim@company.com' for key 'patient.email_UNIQUE'` — confirming the table is `patient`, the column is `email`, and the account exists.
3. Attacker submits malformed types to other endpoints and accumulates column names and types across the schema.
4. With the schema mapped, the SQL injection in [SEC-006](SEC-006-sql-injection.md) is exploited directly — `UNION SELECT email, password FROM patient` — with no blind enumeration required.
5. Separately, forgot-password messages classify each address as patient, care navigator, dependent or unknown.

## Impact

- **Confidentiality:** database schema disclosure; account existence and role disclosure.
- **Exploitation velocity:** substantially accelerates SQL injection exploitation.
- **Compliance:** ASVS V7.4.1 requires a generic message on unexpected errors.
- Rated Medium because it is an accelerant rather than a primary breach vector — and because stack traces, the most damaging form, are not exposed.

## Remediation

**Step 1 — distinguish operational from unexpected errors.**

```js
// helpers/errors.js
class AppError extends Error {
    constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;      // message was authored for the client
    }
}
class ForbiddenError extends AppError {
    constructor() { super('You do not have permission to perform this action.', 403, 'FORBIDDEN'); }
}
module.exports = { AppError, ForbiddenError };
```

Service code throws `AppError` for anything the client should see. Everything else — Sequelize, crypto, `TypeError` — is unexpected by definition.

**Step 2 — one terminal error handler that decides what to reveal.**

```js
// middleware/errorHandler.js
module.exports = function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);      // see SEC-026

    const correlationId = req.id || crypto.randomUUID();

    logger.error({                               // full detail server-side only
        correlationId, err: { message: err.message, stack: err.stack, name: err.name },
        route: req.originalUrl, method: req.method, userId: req.user?.id,
    });

    if (err.isOperational) {
        return CommonHelper.sendError(res, err.statusCode, err.message, { code: err.code, correlationId });
    }
    return CommonHelper.sendError(res, 500, 'An unexpected error occurred.', {
        code: 'INTERNAL_ERROR',
        correlationId,                           // the client quotes this to support
    });
};
```

The correlation id is what makes this practical: support can find the full error in the logs without the client ever seeing it.

**Step 3 — replace the 180 call sites.** Controllers should not catch and format at all; let errors propagate:

```js
// Before
try { ... } catch (error) {
    return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
}

// After — express-async-errors, or a wrapper, forwards to the terminal handler
static async login(req, res) {
    const result = await AuthService.login(req.body);
    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, result);
}
```

**Step 4 — Socket.IO callbacks.**

```js
} catch (err) {
    logger.error({ event: 'socket_error', err, userId: socket.user?.id });
    callback({ success: false, code: 'INTERNAL_ERROR' });    // never err.message
}
```

**Step 5 — generic messages on the auth paths** specifically, to close the enumeration oracle ([SEC-028](SEC-028-account-enumeration.md)).

**Step 6 — add a response-shape test** asserting that no 500 response body contains `Sequelize`, `SQL`, `ER_`, `at Object.` or a file path.

## Verification

1. **Duplicate key:** trigger a unique-constraint violation. The response must be generic with a correlation id; the log must contain the full message.
2. **Type error:** send a string where a number is expected. Response must not name a column.
3. **Crypto error:** send a plaintext body to an encrypted route. Response must be generic ([SEC-029](SEC-029-decryption-middleware-defects.md)).
4. **Socket:** trigger a handler error and confirm the callback carries no `error.message`.
5. **Correlation:** confirm the id in the response matches a log entry containing the full stack.
6. **Static check:** `grep -rn "error.message" controllers/ services/ index.js | grep -i "send\|callback"` returns nothing.

## References

- OWASP — [Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)
- OWASP ASVS 4.0.3 — V7.4 Error Handling
- CWE-209 — [Generation of Error Message Containing Sensitive Information](https://cwe.mitre.org/data/definitions/209.html)
