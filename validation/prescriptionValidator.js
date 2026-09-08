const Joi = require('joi');

const uploadPrescriptionSchema = Joi.object({
    prescriptionFile: Joi.string().required().messages({
        'string.base': 'Prescription file must be a string.',
        'string.empty': 'Prescription file cannot be empty.',
        'any.required': 'Prescription file is required.'
    }),
    notes: Joi.string().allow('').optional().messages({
        'string.base': 'Notes must be a string.'
    }),
    patientId: Joi.number().integer().required(),
});

module.exports = {
    uploadPrescriptionSchema
};
