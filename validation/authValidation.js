const Joi = require('joi');

// SEC-003: minimum length 12 per NIST SP 800-63B (length over composition rules).
const registerSchema = Joi.object({
  email: Joi.string().email().max(191).required(),
  password: Joi.string().min(12).max(128).required(),
  first_name: Joi.string().max(100).required(),
  last_name: Joi.string().max(100).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(191).required(),
  password: Joi.string().max(128).required(),
});

// SEC-017
const refreshSchema = Joi.object({
  refreshToken: Joi.string().hex().length(64).required(),
});

// SEC-012: impersonation requires a stated reason, which is written to the audit
// trail before any token is issued.
const loginPatientSchema = Joi.object({
  patientId: Joi.number().integer().positive().required(),
  reason: Joi.string().trim().min(10).max(500).required(),
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
  employee_email: Joi.string().email().max(191).required(),
  employee_password: Joi.string().min(12).max(128).required(),
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

module.exports = { registerSchema, loginSchema, loginPatientSchema, preEmpAddSchema, externalSignupSchema, ssoClientLoginSchema, refreshSchema };
