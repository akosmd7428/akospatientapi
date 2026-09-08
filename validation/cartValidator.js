const Joi = require('joi');

const addToCartSchema = Joi.object({
    type: Joi.number().valid(1, 2).required().messages({
        'number.base': 'Type must be a number.',
        'any.only': 'Type must be either 1 (test) or 2 (package).',
        'any.required': 'Type is required.'
    }),
    mode: Joi.number().valid(1, 2).required().messages({
        'number.base': 'Mode must be a number.',
        'any.only': 'Mode must be either 1 (Pathology) or 2 (Radiology).',
        'any.required': 'Mode is required.'
    }),
    referenceId: Joi.number().integer().required().messages({
        'number.base': 'Reference ID must be a number.',
        'number.integer': 'Reference ID must be an integer.',
        'any.required': 'Reference ID is required.'
    }),
    companyId: Joi.number().integer().required().messages({
        'number.base': 'Company ID must be a number.',
        'number.integer': 'Company ID must be an integer.',
        'any.required': 'Company ID is required.'
    }),
    patientId: Joi.number().integer().required().messages({
        'number.base': 'Patient ID must be a number.',
        'number.integer': 'Patient ID must be an integer.',
        'any.required': 'Patient ID is required.'
    }),
    labId: Joi.any(),   // Accepts any value
    labType: Joi.any(), // Accepts any value
    code: Joi.any()     // Accepts any value

});

module.exports = {
    addToCartSchema
};
