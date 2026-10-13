const Joi = require('joi');

const sendMessageValidation = Joi.object({
  message: Joi.string().trim().max(5000).required(),
});

module.exports = { sendMessageValidation };
