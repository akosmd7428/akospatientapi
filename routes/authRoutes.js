const express = require('express');
const AuthController = require('../controllers/authController');
const validateSchema = require('../middleware/validateSchema');
const { registerSchema, loginSchema, externalSignupSchema, ssoClientLoginSchema, refreshSchema } = require('../validation/authValidation');
const validateDataEncryption = require('../middleware/validateDataEncryption');
const { requireAuth, ROLES } = require('../middleware/requireAuth');
const { authLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

/**
 * SEC-005: /encrypt, /decrypt and /getquery are gone. They were unauthenticated
 * encryption and decryption oracles for the server's own key.
 *
 * SEC-021: authentication endpoints carry a strict limiter, keyed on IP and
 * account, instead of relying on the global 1000/15min bucket.
 *
 * SEC-016: /ssologin and /sso-client-login now carry validateDataEncryption so
 * client_secret is no longer handled - and logged - in plaintext.
 */
router.post('/register', authLimiter, validateDataEncryption(), validateSchema(registerSchema), AuthController.register);
router.post('/login', authLimiter, validateDataEncryption(), validateSchema(loginSchema), AuthController.login);

// SEC-017: session lifecycle. None of this existed before.
router.post('/refresh', authLimiter, validateDataEncryption(), validateSchema(refreshSchema), AuthController.refresh);
router.post('/logout', requireAuth(ROLES.PATIENT, ROLES.HR, ROLES.CARE_NAVIGATOR), AuthController.logout);
router.post('/logout-all', requireAuth(ROLES.PATIENT, ROLES.HR, ROLES.CARE_NAVIGATOR), AuthController.logoutAll);

router.post('/ssologin', authLimiter, validateDataEncryption(), AuthController.ssologin);
router.post('/sso-client-login', authLimiter, validateDataEncryption(), validateSchema(ssoClientLoginSchema), AuthController.ssoClientLogin);

router.post('/external-signup-old', authLimiter, validateDataEncryption(), validateSchema(externalSignupSchema), AuthController.externalSignup);
router.post('/external-signup', authLimiter, validateDataEncryption(), validateSchema(externalSignupSchema), AuthController.createUserBeforeEmailValidation);
router.get('/verify-email-token', authLimiter, AuthController.verifyEmailPatient);

module.exports = router;
