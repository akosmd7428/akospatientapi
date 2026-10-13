const express = require('express');
const ForgotPasswordController = require('../controllers/forgotPasswordController');
const validateSchema = require('../middleware/validateSchema');
const { sendOtpValidation, verifyOtpValidation, changePasswordValidation, changeOwnPasswordValidation } = require('../validation/forgotPasswordValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const { authorize, ROLES } = require('../middleware/authorize');

const router = express.Router();

router.post('/send-otp',validateDataEncryption(),validateSchema(sendOtpValidation), ForgotPasswordController.sendOtp);
router.post('/verify-otp',validateDataEncryption(), validateSchema(verifyOtpValidation), ForgotPasswordController.verifyOtp);
router.post('/change-password',validateDataEncryption(), validateSchema(changePasswordValidation), ForgotPasswordController.changePassword);
router.post('/resend-otp',validateDataEncryption(), validateSchema(sendOtpValidation), ForgotPasswordController.sendOtp);
// used by the patient, care navigator and hr portals, always changes the caller's own password
router.post('/change_password', authorize(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR), validateDataEncryption(), validateSchema(changeOwnPasswordValidation), ForgotPasswordController.changeOwnPassword);

module.exports = router;
