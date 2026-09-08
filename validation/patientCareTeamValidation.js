const Joi = require('joi');

const addDoctorsValidation = Joi.object({
    doctorIds: Joi.array().items(Joi.number().integer().positive()).min(1).required()
});

module.exports = { addDoctorsValidation };
