const Joi = require('joi');
const { PATIENT_BACKEND_URL } = require('../config/secret');

// the prescription must be a file uploaded through /data/upload, never an arbitrary external url
const isOwnUpload = (value, helpers) => {
    if (PATIENT_BACKEND_URL && !value.startsWith(`${PATIENT_BACKEND_URL.replace(/\/+$/, '')}/assets/`)) {
        return helpers.error('string.uri');
    }
    return value;
};

const uploadPrescriptionSchema = Joi.object({
    prescriptionFile: Joi.string().required().custom(isOwnUpload).messages({
        'string.base': 'Prescription file must be a string.',
        'string.empty': 'Prescription file cannot be empty.',
        'string.uri': 'Prescription file is invalid.',
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
