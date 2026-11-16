const express = require('express');
const router = express.Router();
const AcrossAssistController = require('../controllers/acrossAssistController');
const jwtAuth = require('../middleware/jwtAuth');
const validateDataEncryption = require('../middleware/validateDataEncryption');
const validateSchema = require('../middleware/validateSchema');
const { appointmentConfirmationSchema } = require('../validation/acrossAssistValidation');

// send an appointment confirmation to Across Assist (GetAppointmentConfirmation)
router.post('/appointment-confirmation', jwtAuth, validateDataEncryption(), validateSchema(appointmentConfirmationSchema), AcrossAssistController.sendAppointmentConfirmation);

module.exports = router;
