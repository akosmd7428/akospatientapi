const Joi = require('joi');

const createLabOrderSchema = Joi.object({
    patientId: Joi.number().required(),
    bookingDate: Joi.string(),
    bookingTime: Joi.string(),
    bookingAddress: Joi.string(),
    labId: Joi.number().required(),
    labCityName: Joi.string().required(),
    labBranchId: Joi.number().required(),
    price: Joi.number(),
    discountApplied: Joi.number(),
    otherCharges: Joi.number(),
    totalPrice: Joi.number(),
    isPaid: Joi.boolean(),
    orderStatus: Joi.string().valid('pending', 'confirmed', 'cancelled'),
    paymentStatus: Joi.string().valid('unpaid', 'paid', 'failed'),
    noOfTest: Joi.number(),
    orderDetails: Joi.array().items(
        Joi.object({
            cartId: Joi.number(),
            type: Joi.string().valid('1', '2').required(),
            referenceId: Joi.number().required(),
            name: Joi.string().required(),
            modeOfTest: Joi.string(),
            noOfTest: Joi.number(),
            price: Joi.number().required(),
            discount: Joi.number(),
            total: Joi.number().required()
        })
    ).required()
});

module.exports = { createLabOrderSchema };
