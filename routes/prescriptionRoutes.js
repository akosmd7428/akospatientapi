const express = require('express');
const PatientController = require('../controllers/patientController');
const AppointmentController = require('../controllers/appointmentController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const { authorize, ROLES } = require('../middleware/authorize');
const router = express.Router();

// prescription writing is a doctor action, the doctor token is issued by doctorportalapi
router.post('/prescription/detail',validateDataEncryption(), authorize(ROLES.DOCTOR), PatientController.savePrescriptionDetails);
// router.post('/prescription/medication', PatientController.savePrescriptionMedication);
router.get('/prescription',validateDataEncryption(), authorize(ROLES.DOCTOR), PatientController.getPrescriptionDetail);
router.get('/medicines',validateDataEncryption(), authorize(ROLES.DOCTOR), AppointmentController.getMedicines);

module.exports = router;
