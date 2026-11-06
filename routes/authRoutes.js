const express = require('express');
const AuthController = require('../controllers/authController');
const validateSchema = require('../middleware/validateSchema');
const { registerSchema, loginSchema, externalSignupSchema, ssoClientLoginSchema, ssoGenerateCodeSchema, ssoVerifyCodeSchema, ssoDeeplinkSchema, ssoDeeplinkVerifySchema} = require('../validation/authValidation');
const jwtAuth = require('../middleware/jwtAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const syncApiKeyAuth = require('../middleware/syncApiKeyAuth');
const clientAuth = require('../middleware/clientAuth');
const { authorize, ROLES } = require('../middleware/authorize');
const { loadCareNavigatorScope } = require('../middleware/careNavigatorScope');

const router = express.Router();

// server callers send the sync key, the care navigator portal sends its own login token and is limited to its companies
const ssoGenerateCodeAuth = (req, res, next) => {
    if (req.header('x-sync-api-key')) {
        return syncApiKeyAuth(req, res, next);
    }
    return authorize(ROLES.CARE_NAVIGATOR)(req, res, (err) => (err ? next(err) : loadCareNavigatorScope(req, res, next)));
};

// kept from main but only for server callers with the x-sync-api-key header:
// /register (unverified accounts, bcrypt hash that login can never match), /encrypt, /decrypt, /getquery (debug encryption/decryption oracle),
// /ssologin (company/patient creation, the hr portal calls the ohc api for it), /external-signup-old (no email verification)
router.post('/register', syncApiKeyAuth, validateDataEncryption(), validateSchema(registerSchema), AuthController.register);
router.post('/encrypt', syncApiKeyAuth, AuthController.encryptDataSample);
router.post('/decrypt', syncApiKeyAuth, AuthController.decryptDataSample);
router.get('/getquery', syncApiKeyAuth, AuthController.getQueryStr);
router.post('/ssologin', syncApiKeyAuth, AuthController.ssologin);
router.post('/external-signup-old', syncApiKeyAuth, validateDataEncryption(), validateSchema(externalSignupSchema), AuthController.externalSignup);
router.post('/login',validateDataEncryption(),validateSchema(loginSchema), AuthController.login);
router.post('/sso-client-login', clientAuth, validateSchema(ssoClientLoginSchema), AuthController.ssoClientLogin);
router.post('/sso-generate-code', ssoGenerateCodeAuth, validateDataEncryption(), validateSchema(ssoGenerateCodeSchema), AuthController.ssoGenerateCode);
router.post('/sso-deeplink',clientAuth, jwtAuth, validateSchema(ssoDeeplinkSchema), AuthController.ssoDeeplink);
router.post('/sso-verify-code',validateDataEncryption(),validateSchema(ssoVerifyCodeSchema), AuthController.ssoVerifyCode);
router.post('/sso-deeplink-verify',validateDataEncryption(),validateSchema(ssoDeeplinkVerifySchema), AuthController.ssoDeeplinkVerify);
router.post('/external-signup',validateDataEncryption(),validateSchema(externalSignupSchema),AuthController.createUserBeforeEmailValidation);
router.get('/verify-email-token',validateDataEncryption(),AuthController.verifyEmailPatient);
module.exports = router;
