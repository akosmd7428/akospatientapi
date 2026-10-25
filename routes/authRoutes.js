const express = require('express');
const AuthController = require('../controllers/authController');
const validateSchema = require('../middleware/validateSchema');
const { loginSchema, externalSignupSchema, ssoClientLoginSchema, ssoGenerateCodeSchema, ssoVerifyCodeSchema} = require('../validation/authValidation');
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

// removed: /register (unverified accounts, bcrypt hash that login can never match), /encrypt, /decrypt, /getquery (debug decryption oracle),
// /ssologin (unauthenticated company/patient creation, the hr portal calls the ohc api for it), /external-signup-old (no email verification)
router.post('/login',validateSchema(loginSchema), AuthController.login);
router.post('/sso-client-login', clientAuth, validateSchema(ssoClientLoginSchema), AuthController.ssoClientLogin);
router.post('/sso-generate-code', ssoGenerateCodeAuth, validateDataEncryption(), validateSchema(ssoGenerateCodeSchema), AuthController.ssoGenerateCode);
router.post('/sso-verify-code',validateDataEncryption(),validateSchema(ssoVerifyCodeSchema), AuthController.ssoVerifyCode);
router.post('/external-signup',validateDataEncryption(),validateSchema(externalSignupSchema),AuthController.createUserBeforeEmailValidation);
router.get('/verify-email-token',validateDataEncryption(),AuthController.verifyEmailPatient);
module.exports = router;
