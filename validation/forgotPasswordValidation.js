const Joi = require('joi');

const sendOtpValidation = Joi.object({
  email: Joi.string().email().required(),
});

const verifyOtpValidation = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().required(),
});

const changePasswordValidation = Joi.object({
  email: Joi.string().email().required(),
  newPassword: Joi.string().min(6).required(),
});

// logged in password change, the email is still accepted from the frontends but never used
const changeOwnPasswordValidation = Joi.object({
  email: Joi.string().allow('', null).optional(),
  newPassword: Joi.string().min(6).required(),
});

module.exports = { sendOtpValidation, verifyOtpValidation, changePasswordValidation, changeOwnPasswordValidation };
