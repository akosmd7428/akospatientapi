const Joi = require('joi');

const registerSchema = {
  [Segments.BODY]: Joi.object().keys({
    email: Joi.string().email().required().messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'Password is required'
    }),
    first_name: Joi.string().required().messages({
      'any.required': 'First name is required'
    }),
    last_name: Joi.string().required().messages({
      'any.required': 'Last name is required'
    })
  })
};

module.exports = registerSchema;
