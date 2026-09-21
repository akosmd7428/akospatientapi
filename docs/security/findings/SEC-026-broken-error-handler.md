# SEC-026 — Error handler never responds and is mounted unreachably

| Field | Value |
|---|---|
| Severity | **Medium** |
| CVSS v3.1 | 5.3 (`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`) |
| OWASP Top 10 2021 | A05:2021 – Security Misconfiguration |
| OWASP ASVS 4.0.3 | V7.4.2 – Exception handling used across the codebase; V7.4.3 – A "last resort" error handler is defined |
| CWE | CWE-755 – Improper Handling of Exceptional Conditions; CWE-703 – Improper Check or Handling of Exceptional Conditions |
| Status | Open |
| Affected component | `middleware/errorHandler.js`, `index.js`, all controllers |

## Summary

`middleware/errorHandler.js` is declared as a four-argument Express error handler but never sends a response. On one path it calls `next()` — not `next(err)` — and on the other it falls off the end of the function. A request that reaches it hangs until the client times out.

It is also mounted at `index.js:104`, *after* a different error handler at `:97` that does respond, so in the middleware chain it is unreachable dead code. Controllers nevertheless call it **directly**, and then call `CommonHelper.sendError` immediately afterwards — producing a double-logging path and a risk of `ERR_HTTP_HEADERS_SENT`.

The net effect is that error handling is non-deterministic: which of three mechanisms runs depends on where the error originated.

## Affected code

`middleware/errorHandler.js:6-28`:

```js
const errorHandler = async (err, req, res, next) => {
    const stackLine = err.stack.split('\n')[1];        // :11  throws if err.stack is undefined
    const additionalData = req.body;                   // :13  see SEC-016
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);   // :18  unhardened — see SEC-017
            req.user = decoded;                              // :19  identity set outside the guard
        }
        await LogService.logError(..., JSON.stringify(additionalData), ...);   // :21
    } catch (error) {
        next();                                        // :22  next() from an error handler, and no response
    }
    // :27  falls through — no res.* call on the success path either
};
```

`index.js:97-104` — two handlers, in the wrong order:

```js
app.use((err, req, res, next) => {                                     // :97  responds
    CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, err.message);
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));    // :101

app.use(errorHandler);                                                 // :104  never reached
```

Controllers invoke it directly and then also respond — `controllers/authController.js:24-25` is representative, and the pattern repeats at `:75, 91, 106, 131` and throughout:

```js
} catch (error) {
    errorHandler(error, req, res, next);                                              // :24
    return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);   // :25
}
```

## Technical detail

**Express error-handler semantics.** A middleware with four parameters is an error handler. It must either send a response or call `next(err)` to delegate. Calling bare `next()` passes control to the next **non-error** middleware, which skips the remaining error handlers — so the error is silently dropped and no response is ever sent. Falling off the end has the same effect.

**Registration order.** Express matches middleware in registration order. The responding handler at `:97` is registered first, so it always wins. `app.use(errorHandler)` at `:104` can never be reached through the chain. The intended "last resort" handler is dead.

**The direct-call pattern is the live problem.** Because controllers call `errorHandler(...)` as a plain function, it *does* execute — outside the middleware chain, with the `next` from the controller's scope. Two effects follow:

1. `errorHandler` is `async` and is called without `await`. Its database write races with the `sendError` on the next line. If the write rejects, the rejection is unhandled — in Node 15+ that terminates the process by default.
2. If a future edit makes `errorHandler` respond, the subsequent `sendError` throws `ERR_HTTP_HEADERS_SENT`, which in an async context becomes another unhandled rejection.

**`err.stack.split` at line 11** runs before any try/catch. If `err` is not an `Error` — a thrown string or object, which occurs in several places — `err.stack` is `undefined` and `.split` throws a `TypeError` *inside the error handler*. That secondary error is entirely unhandled.

**Identity outside the guard.** Line 19 sets `req.user` from a verified token with no role check. Combined with the same pattern in `middleware/routeLogger.js:11-17`, `req.user` can be populated on requests that never passed an authentication middleware — a latent authorization hazard for any handler that reads `req.user` without a guard ([SEC-017](SEC-017-jwt-hardening-gaps.md)).

## Exploit scenario

This is primarily a reliability and availability defect rather than a direct attack path.

1. Attacker triggers an error on a path where the controller does not catch — for example the unguarded decryption failure in [SEC-029](SEC-029-decryption-middleware-defects.md).
2. Control reaches an error handler that never responds. The connection is held open until the client or proxy times out.
3. Repeating this consumes connection-pool slots and proxy worker capacity — a low-cost, unauthenticated resource-exhaustion vector.
4. Separately, a thrown non-`Error` value causes `err.stack.split` to throw inside the handler. The unhandled rejection from the un-awaited `logError` can terminate the worker process.
5. Because error paths are non-deterministic, incidents are hard to reproduce and diagnose — which is itself a security cost during response.

## Impact

- **Availability:** hung requests, exhausted connections, and a path to process termination via unhandled rejection.
- **Observability:** errors can be dropped without a response *and* without a log, so failures pass unnoticed.
- **Correctness:** three competing error paths make behaviour unpredictable, complicating incident response.
- **Latent risk:** `req.user` set outside the auth guard.

## Remediation

**Step 1 — make the handler terminal and correct.**

```js
// middleware/errorHandler.js
const crypto = require('crypto');

module.exports = function errorHandler(err, req, res, next) {
    // If a response has already started, Express must finish it — delegate.
    if (res.headersSent) return next(err);

    const correlationId = req.id || crypto.randomUUID();

    // Never assume err is an Error instance.
    const normalised = err instanceof Error ? err : new Error(String(err));

    logger.error({
        correlationId,
        err: { name: normalised.name, message: normalised.message, stack: normalised.stack },
        route: req.originalUrl, method: req.method, userId: req.user?.id,
    });

    // Fire-and-forget persistence must never be able to crash the process.
    LogService.logError({ correlationId, route: req.originalUrl, userId: req.user?.id })
        .catch((e) => logger.error({ msg: 'audit write failed', err: e }));

    const status = normalised.isOperational ? normalised.statusCode : 500;
    const body = normalised.isOperational
        ? { message: normalised.message, code: normalised.code, correlationId }
        : { message: 'An unexpected error occurred.', code: 'INTERNAL_ERROR', correlationId };

    return res.status(status).json(body);       // always responds — see SEC-025
};
```

**Step 2 — mount it once, last.**

```diff
--- a/index.js
-app.use((err, req, res, next) => {
-  CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, err.message);
-});
-
 app.use('/assets', ...);
+
+app.use((req, res) => res.status(404).json({ message: 'Not found' }));   // 404 before the error handler
+app.use(errorHandler);                                                    // terminal, and genuinely last
```

**Step 3 — stop calling it directly from controllers.** Let errors propagate. With `express-async-errors` required once at the top of `index.js`, async controller rejections reach the handler automatically:

```js
// index.js, first line after requires
require('express-async-errors');
```

```js
// controllers/authController.js — no try/catch at all
static async login(req, res) {
    const result = await AuthService.login(req.body);
    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, result);
}
```

Catch only where the controller genuinely adds context, and then `throw new AppError(...)` rather than responding.

**Step 4 — remove `req.user = decoded`** from `errorHandler.js:19` and `routeLogger.js:13-17`. Only the authentication middleware may establish identity.

**Step 5 — add process-level safety nets.**

```js
process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'unhandled rejection');
    shutdownGracefully(1);
});
process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    shutdownGracefully(1);
});
```

**Step 6 — set a server timeout** so a stuck request cannot hold a connection indefinitely:

```js
httpServer.requestTimeout = 30_000;
httpServer.headersTimeout = 35_000;
```

## Verification

1. **Response guaranteed:** throw from a route handler; the client must receive a 500 with a correlation id, not a hang.
2. **Non-Error throw:** `throw 'boom'` from a handler — must produce a 500, not a `TypeError` inside the handler.
3. **No double response:** provoke an error after `res.json` has been called; confirm no `ERR_HTTP_HEADERS_SENT` in the logs.
4. **404:** request an unknown path; must return a JSON 404, not hang.
5. **Direct calls removed:** `grep -rn "errorHandler(" controllers/ services/` returns nothing.
6. **Timeout:** open a request that never completes and confirm the server closes it after 30 seconds.
7. **Log correlation:** every 500 response's correlation id resolves to a log entry with the full stack.

## References

- Express — [Error handling](https://expressjs.com/en/guide/error-handling.html)
- OWASP ASVS 4.0.3 — V7.4 Error Handling
- CWE-755 — [Improper Handling of Exceptional Conditions](https://cwe.mitre.org/data/definitions/755.html)
