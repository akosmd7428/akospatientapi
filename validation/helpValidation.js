const Joi = require('joi');

const sendMessageValidation = Joi.object({
  message: Joi.string().required(),
});

module.exports = { sendMessageValidation };
