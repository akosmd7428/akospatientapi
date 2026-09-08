const express = require('express');
const ForgotPasswordController = require('../controllers/forgotPasswordController');
const validateSchema = require('../middleware/validateSchema');
const { sendOtpValidation, verifyOtpValidation, changePasswordValidation } = require('../validation/forgotPasswordValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const jwtAuth = require('../middleware/jwtAuth');

const router = express.Router();

router.post('/send-otp',validateDataEncryption(),validateSchema(sendOtpValidation), ForgotPasswordController.sendOtp);
router.post('/verify-otp',validateDataEncryption(), validateSchema(verifyOtpValidation), ForgotPasswordController.verifyOtp);
router.post('/change-password',validateDataEncryption(), validateSchema(changePasswordValidation), ForgotPasswordController.changePassword);
router.post('/resend-otp',validateDataEncryption(), validateSchema(sendOtpValidation), ForgotPasswordController.sendOtp);
router.post('/change_password',validateDataEncryption(), validateSchema(changePasswordValidation), jwtAuth, ForgotPasswordController.changePassword);

module.exports = router;
