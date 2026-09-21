'use strict';

/**
 * The terminal error handler.
 *
 * SEC-026: the previous version was declared as a 4-argument Express error
 * handler but never sent a response - one path called bare `next()` (which skips
 * remaining error handlers, dropping the error silently) and the other fell off
 * the end. Requests reaching it hung until the client timed out. It was also
 * mounted after a responding handler, so it was unreachable in the chain, yet
 * controllers called it directly and then also called sendError - a double
 * response hazard. It read `err.stack.split` before any try/catch, so a thrown
 * non-Error threw a TypeError inside the error handler.
 *
 * SEC-025: raw error.message was forwarded to clients at ~180 sites, leaking
 * Sequelize table, column and constraint names. Only messages the application
 * authored (AppError) are shown now; everything else becomes a generic message
 * plus a correlation id that resolves to the full detail in the logs.
 *
 * SEC-016: the request body is no longer persisted.
 * SEC-017: it no longer sets req.user from a token outside the auth guard.
 */

const crypto = require('crypto');
const { logError } = require('../helpers/logErrorHelper');
const { STATUS_CODE } = require('../config/constant');
const { messages } = require('../config/language');

module.exports = function errorHandler(err, req, res, next) {
    // If a response has already started, Express must finish it.
    if (res.headersSent) {
        return next(err);
    }

    const correlationId = crypto.randomUUID();
    const normalised = err instanceof Error ? err : new Error(String(err));

    console.error('[error]', {
        correlationId,
        name: normalised.name,
        message: normalised.message,
        stack: normalised.stack,
        method: req.method,
        route: req.originalUrl,
        userId: req.user && req.user.id,
    });

    // Fire and forget: a failure to persist must never crash the process or
    // block the response.
    Promise.resolve(
        logError(
            (req.user && req.user.id) || null,
            normalised.message,
            req.originalUrl,
            normalised.name,
            correlationId,
            null, // SEC-016: never the request body
            (req.user && req.user.role) || null
        )
    ).catch(() => { /* audit write failed; already logged above */ });

    const isOperational = normalised.isOperational === true;
    const status = isOperational
        ? (normalised.statusCode || STATUS_CODE.HTTP_400_BAD_REQUEST)
        : STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR;

    const body = isOperational
        ? { success: false, message: normalised.message, code: normalised.code, correlationId }
        : { success: false, message: messages.serverError, code: 'INTERNAL_ERROR', correlationId };

    return res.status(status).json(body);
};
