'use strict';

/**
 * SEC-025: distinguish errors whose message was authored for the client from
 * errors produced by a library. Only the former may be shown to a caller;
 * everything else becomes a generic message plus a correlation id.
 */

class AppError extends Error {
    constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class BadRequestError extends AppError {
    constructor(message = 'Invalid request') {
        super(message, 400, 'BAD_REQUEST');
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

/**
 * SEC-011 / SEC-028: the same response for "does not exist" and "not permitted",
 * so 403-versus-404 cannot be used to enumerate objects.
 */
class ForbiddenError extends AppError {
    constructor(message = 'You do not have permission to perform this action') {
        super(message, 403, 'FORBIDDEN');
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Not found') {
        super(message, 404, 'NOT_FOUND');
    }
}

class TooManyRequestsError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429, 'TOO_MANY_REQUESTS');
    }
}

module.exports = {
    AppError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    TooManyRequestsError,
};
