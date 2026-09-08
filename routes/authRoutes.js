const express = require('express');
const AuthController = require('../controllers/authController');
const validateSchema = require('../middleware/validateSchema');
const { registerSchema, loginSchema, externalSignupSchema, ssoClientLoginSchema} = require('../validation/authValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');

const router = express.Router();

router.post('/register',validateDataEncryption(),validateSchema(registerSchema), AuthController.register);
router.post('/login',validateDataEncryption(),validateSchema(loginSchema), AuthController.login);
router.post('/encrypt', AuthController.encryptDataSample);
router.post('/decrypt', AuthController.decryptDataSample);
router.get('/getquery',AuthController.getQueryStr);
router.post('/ssologin', AuthController.ssologin);
router.post('/sso-client-login', validateSchema(ssoClientLoginSchema), AuthController.ssoClientLogin);
router.post('/external-signup-old',validateDataEncryption(),validateSchema(externalSignupSchema),AuthController.externalSignup);
router.post('/external-signup',validateDataEncryption(),validateSchema(externalSignupSchema),AuthController.createUserBeforeEmailValidation);
router.get('/verify-email-token',validateDataEncryption(),AuthController.verifyEmailPatient);
module.exports = router;
