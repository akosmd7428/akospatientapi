const Joi = require('joi');

const patientAssessmentSchema = Joi.object({
    patientId: Joi.number().integer().required(),
    assessmentId: Joi.number().integer().required(),
    assessmentQuestionId: Joi.number().integer().required(),
    assessmentOptionId: Joi.number().integer().required(),
});

module.exports = { patientAssessmentSchema };
