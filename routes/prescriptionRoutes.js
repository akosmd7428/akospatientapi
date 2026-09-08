const express = require('express');
const PatientController = require('../controllers/patientController');
const AppointmentController = require('../controllers/appointmentController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.post('/prescription/detail',validateDataEncryption(), PatientController.savePrescriptionDetails);
// router.post('/prescription/medication', PatientController.savePrescriptionMedication);
router.get('/prescription',validateDataEncryption(),PatientController.getPrescriptionDetail);
router.get('/medicines',validateDataEncryption(),AppointmentController.getMedicines);

module.exports = router;
