const express = require('express');
const HelpController = require('../controllers/helpController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const { authorize, ROLES } = require('../middleware/authorize');
const validateSchema = require('../middleware/validateSchema');
const { sendMessageValidation } = require('../validation/helpValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

// faq is shown in the patient and care navigator portals
router.get('/faq',validateDataEncryption(), authorize(ROLES.PATIENT, ROLES.CARE_NAVIGATOR), HelpController.getHelpFaq);
router.post('/send-email',validateDataEncryption(), jwtAuth, validateSchema(sendMessageValidation), HelpController.sendEmail);

module.exports = router;
