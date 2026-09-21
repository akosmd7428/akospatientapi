const Joi = require('joi');

/**
 * SEC-013: this schema previously accepted patientId, price, totalPrice, isPaid,
 * orderStatus and paymentStatus from the client. Combined with
 * LabOrder.create(req.body) that let a caller book a paid, zero-cost order, or
 * place one against another patient's record.
 *
 * Those fields are server-controlled and are set in LabTestService.createLabOrder.
 * They are not accepted here, and validateSchema strips unknown keys, so sending
 * them has no effect.
 */
const createLabOrderSchema = Joi.object({
    bookingDate: Joi.string().max(64),
    bookingTime: Joi.string().max(64),
    bookingAddress: Joi.string().max(500),
    labId: Joi.number().integer().positive().required(),
    labCityName: Joi.string().max(191).required(),
    labBranchId: Joi.number().integer().positive().required(),
    orderDetails: Joi.array().min(1).max(100).items(
        Joi.object({
            cartId: Joi.number().integer().positive(),
            type: Joi.string().valid('1', '2').required(),
            referenceId: Joi.number().integer().positive().required(),
            name: Joi.string().max(255).required(),
            modeOfTest: Joi.string().max(64),
            noOfTest: Joi.number().integer().min(0),
        })
    ).required(),
});

module.exports = { createLabOrderSchema };
