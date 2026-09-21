const Joi = require('joi');

const sendOtpValidation = Joi.object({
  email: Joi.string().email().max(191).required(),
});

const verifyOtpValidation = Joi.object({
  email: Joi.string().email().max(191).required(),
  otp: Joi.string().pattern(/^\d{6}$/).required(),
});

// SEC-002: the reset token issued by verify-otp is now mandatory.
// SEC-003: minimum length raised to 12 per NIST SP 800-63B (length over composition).
const changePasswordValidation = Joi.object({
  email: Joi.string().email().max(191).required(),
  newPassword: Joi.string().min(12).max(128).required(),
  resetToken: Joi.string().hex().length(64).required(),
});

module.exports = { sendOtpValidation, verifyOtpValidation, changePasswordValidation };
