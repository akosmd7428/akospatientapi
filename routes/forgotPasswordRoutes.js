const express = require('express');
const ForgotPasswordController = require('../controllers/forgotPasswordController');
const validateSchema = require('../middleware/validateSchema');
const { sendOtpValidation, verifyOtpValidation, changePasswordValidation } = require('../validation/forgotPasswordValidation');
const validateDataEncryption = require('../middleware/validateDataEncryption');
const { otpIssueLimiter, authLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

/**
 * SEC-002: /change-password is reachable without a session by design - the user
 * has forgotten their password - but it now requires the single-use reset token
 * that verify-otp issues. Previously it required nothing at all, so an email
 * address alone rewrote any account's credential.
 *
 * The duplicate /change_password route that carried jwtAuth has been removed:
 * one reset endpoint only.
 *
 * SEC-021: dedicated limiters. The global 1000/15min bucket was not a barrier.
 */
router.post('/send-otp', otpIssueLimiter, validateDataEncryption(), validateSchema(sendOtpValidation), ForgotPasswordController.sendOtp);
router.post('/resend-otp', otpIssueLimiter, validateDataEncryption(), validateSchema(sendOtpValidation), ForgotPasswordController.sendOtp);
router.post('/verify-otp', authLimiter, validateDataEncryption(), validateSchema(verifyOtpValidation), ForgotPasswordController.verifyOtp);
router.post('/change-password', authLimiter, validateDataEncryption(), validateSchema(changePasswordValidation), ForgotPasswordController.changePassword);

module.exports = router;
