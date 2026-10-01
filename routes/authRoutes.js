const express = require('express');
const AuthController = require('../controllers/authController');
const validateSchema = require('../middleware/validateSchema');
const { registerSchema, loginSchema, externalSignupSchema, ssoClientLoginSchema, ssoGenerateCodeSchema, ssoVerifyCodeSchema} = require('../validation/authValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const syncApiKeyAuth = require('../middleware/syncApiKeyAuth');

const router = express.Router();

router.post('/register',validateDataEncryption(),validateSchema(registerSchema), AuthController.register);
router.post('/login',validateDataEncryption(),validateSchema(loginSchema), AuthController.login);
router.post('/encrypt', AuthController.encryptDataSample);
router.post('/decrypt', AuthController.decryptDataSample);
router.get('/getquery',AuthController.getQueryStr);
router.post('/ssologin', AuthController.ssologin);
router.post('/sso-client-login', validateSchema(ssoClientLoginSchema), AuthController.ssoClientLogin);
router.post('/sso-generate-code', validateDataEncryption(), validateSchema(ssoGenerateCodeSchema), AuthController.ssoGenerateCode); //syncApiKeyAuth
router.post('/sso-verify-code',validateDataEncryption(),validateSchema(ssoVerifyCodeSchema), AuthController.ssoVerifyCode);
router.post('/external-signup-old',validateDataEncryption(),validateSchema(externalSignupSchema),AuthController.externalSignup);
router.post('/external-signup',validateDataEncryption(),validateSchema(externalSignupSchema),AuthController.createUserBeforeEmailValidation);
router.get('/verify-email-token',validateDataEncryption(),AuthController.verifyEmailPatient);
module.exports = router;
