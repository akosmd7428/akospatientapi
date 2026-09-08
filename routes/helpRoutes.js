const express = require('express');
const HelpController = require('../controllers/helpController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const validateSchema = require('../middleware/validateSchema');
const { sendMessageValidation } = require('../validation/helpValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/faq',validateDataEncryption(), jwtAuth, HelpController.getHelpFaq);
router.post('/send-email',validateDataEncryption(), validateSchema(sendMessageValidation), jwtAuth, HelpController.sendEmail);

module.exports = router;
