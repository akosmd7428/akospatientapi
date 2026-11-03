const Joi = require('joi');

// POST /api/hr/addEmployee, the hr portal sends name, email, dateofbirth, gender, city, state, zip_code, phone, companyId.
// only email and name are required, other fields stay loose so current payloads keep passing
const optionalText = (max) => Joi.alternatives().try(Joi.string().trim().max(max), Joi.number()).allow('', null).optional();

const addEmployeeSchema = Joi.object({
  email: Joi.string().trim().email().max(255).required(),
  name: Joi.string().trim().min(1).max(255).required(),
  phone: optionalText(20),
  gender: Joi.string().trim().max(20).allow('', null).optional(),
  age: optionalText(3),
  dateofbirth: Joi.alternatives().try(Joi.string().trim().max(30), Joi.date()).allow('', null).optional(),
  city: optionalText(100),
  state: optionalText(100),
  zip_code: optionalText(10),
  companyId: optionalText(255),
}).unknown(true);

module.exports = { addEmployeeSchema };
