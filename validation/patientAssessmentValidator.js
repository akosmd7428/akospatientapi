const Joi = require('joi');

const patientAssessmentSchema = Joi.object({
    id: Joi.number().integer().positive(),
    // ignored, the patient is taken from the token
    patientId: Joi.number().integer(),
    assessmentId: Joi.number().integer().required(),
    assessmentQuestionId: Joi.number().integer().required(),
    assessmentOptionId: Joi.number().integer().required(),
});

module.exports = { patientAssessmentSchema };
