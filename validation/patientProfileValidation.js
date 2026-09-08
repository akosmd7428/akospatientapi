const Joi = require('joi');

const profileSchema = Joi.object({
  id: Joi.number().optional(),
  fullname: Joi.string().required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().required(),
  dateofbirth: Joi.date().required(),
  age: Joi.number().required(),
  bloodgroup: Joi.string().required(),
  emergency_contact: Joi.string().required(),
  current_location: Joi.object({
    city: Joi.string().required(),
    state: Joi.string().required()
  }).required(),
  profile_image: Joi.string().required(),
  aadharcard: Joi.string().required(),
  abha_id: Joi.string().required(),
  medications: Joi.array().items(Joi.number()).required(),
  medical_allergies: Joi.array().items(Joi.number()).required(),
  other_information: Joi.string().required(),
  dependents: Joi.array().items(Joi.object({
    id: Joi.number().optional(),
    fullname: Joi.string().required(),
    email: Joi.string().email().required(),
    mobile: Joi.string().required(),
    dateofbirth: Joi.date().required(),
    age: Joi.number().required(),
    bloodgroup: Joi.string().required(),
    emergency_contact: Joi.string().required(),
    current_location: Joi.object({
      city: Joi.string().required(),
      state: Joi.string().required()
    }).required(),
    profile_image: Joi.string().required(),
    aadharcard: Joi.string().required(),
    abha_id: Joi.string().required(),
    medications: Joi.array().items(Joi.number()).required(),
    medical_allergies: Joi.array().items(Joi.number()).required(),
    other_information: Joi.string().required()
  })).optional()
});

module.exports = {
  profileSchema
};
