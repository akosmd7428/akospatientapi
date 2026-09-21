'use strict';

/**
 * Request validation.
 *
 * SEC-027: two routers imported their Joi schema under the wrong export name, so
 * the value was `undefined`. Nothing checked, so the failure surfaced only when a
 * request arrived - as a TypeError in one case, and as silently absent
 * validation in the other. The guard below turns that into a startup failure,
 * because validateSchema(...) is called when the routers are required.
 *
 * SEC-013: stripUnknown removes fields the schema does not name, so a request
 * body can no longer carry extra columns into a Sequelize create or update.
 */

const Joi = require('joi');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');
const { messages } = require('../config/language');

const OPTIONS = {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
};

const validateSchema = (schema, source = 'body') => {
    if (!Joi.isSchema(schema)) {
        throw new Error(
            `validateSchema() requires a Joi schema; received ${typeof schema}. `
            + 'This is almost always a wrong import name.'
        );
    }
    if (!['body', 'query', 'params'].includes(source)) {
        throw new Error(`validateSchema() source must be body, query or params; received ${source}`);
    }

    return (req, res, next) => {
        const { error, value } = schema.validate(req[source], OPTIONS);

        if (error) {
            return CommonHelper.sendError(
                res,
                STATUS_CODE.HTTP_400_BAD_REQUEST,
                messages.validationError,
                error.details.map((detail) => detail.message)
            );
        }

        // The handler sees only validated, allow-listed data.
        if (source === 'query') {
            Object.defineProperty(req, 'query', {
                value,
                writable: true,
                configurable: true,
                enumerable: true,
            });
        } else {
            req[source] = value;
        }

        return next();
    };
};

module.exports = validateSchema;
