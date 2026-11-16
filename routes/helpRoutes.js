const express = require('express');
const HelpController = require('../controllers/helpController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const { authorize, ROLES } = require('../middleware/authorize');
const validateSchema = require('../middleware/validateSchema');
const { sendMessageValidation } = require('../validation/helpValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

// faq is shown in the patient and care navigator portals
router.get('/faq', authorize(ROLES.PATIENT, ROLES.CARE_NAVIGATOR), validateDataEncryption(), HelpController.getHelpFaq);
router.post('/send-email', jwtAuth, validateDataEncryption(), validateSchema(sendMessageValidation), HelpController.sendEmail);

module.exports = router;
