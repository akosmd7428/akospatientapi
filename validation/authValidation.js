const Joi = require('joi');

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  first_name: Joi.string().required(),
  last_name: Joi.string().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const loginPatientSchema = Joi.object({
  patientId: Joi.number().required(),
});

const preEmpAddSchema = Joi.object({
  email: Joi.string().email().required(),  
  name: Joi.string().required(),
  gender: Joi.string().required(),
  //currentLocation: Joi.string().required(),
  city: Joi.number().integer().required(),
  dateofbirth: Joi.string().required(),
  age: Joi.string().required(),
  state: Joi.number().integer().required(),
  zip_code: Joi.string().required(),
  phone:Joi.string().required(),
  companyId:Joi.string().required(),
  type:Joi.string().required(),
  health_check_up_date: Joi.string().required(),
});
const externalSignupSchema = Joi.object({
  employee_email: Joi.string().email().required(),
  employee_password: Joi.string().min(6).required(),
  employee_name: Joi.string().required(),
  employee_mobile: Joi.string().required(),
  employer_id:Joi.number().integer().required(),
  company_name:Joi.string().required(),
    company_address:Joi.string().required(),
});

// sso login for an api client, parent_client_id is optional and only sent by a parent company
const ssoClientLoginSchema = Joi.object({
  parent_client_id: Joi.string().allow('', null).optional(),
  client_id: Joi.string().required(),
  client_secret: Joi.string().required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().allow('', null).optional(),
  firstname: Joi.string().optional(),
  first_name: Joi.string().optional(),
  last_name: Joi.string().allow('', null).optional(),
  lastname: Joi.string().allow('', null).optional(),
  'last-name': Joi.string().allow('', null).optional(),
}).or('firstname', 'first_name');

// generate a one time sso login code for a patient
const ssoGenerateCodeSchema = Joi.object({
  patient_id: Joi.number().integer().positive().required(),
});

// exchange a one time sso login code for the login token
const ssoVerifyCodeSchema = Joi.object({
  code: Joi.string().hex().length(64).required(),
});

module.exports = { registerSchema, loginSchema, loginPatientSchema,preEmpAddSchema,externalSignupSchema,ssoClientLoginSchema,ssoGenerateCodeSchema,ssoVerifyCodeSchema };
