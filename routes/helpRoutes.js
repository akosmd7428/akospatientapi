const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const HelpController = require('../controllers/helpController');
const validateSchema = require('../middleware/validateSchema');
const { sendMessageValidation } = require('../validation/helpValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/faq',requireAuth(ROLES.PATIENT), validateDataEncryption(), HelpController.getHelpFaq);
router.post('/send-email',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(sendMessageValidation), HelpController.sendEmail);

module.exports = router;
