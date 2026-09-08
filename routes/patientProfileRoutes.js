const express = require('express');
// const PatientProfileController = require('../controllers/patientProfileController');
const PatientController = require('../controllers/patientController');
// const validateSchema = require('../middleware/validateSchema');
// const { profileSchema } = require('../validation/patientProfileValidation');
const jwtAuth = require('../middleware/jwtAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/profile',validateDataEncryption(),jwtAuth, PatientController.getPatientProfileDetails);
router.post('/profile',validateDataEncryption(), jwtAuth, PatientController.createOrUpdateProfile);
router.get('/details/:patientEmail',validateDataEncryption(), PatientController.getPatientDetails);
router.post('/updateProfile',validateDataEncryption(), jwtAuth, PatientController.updateProfile);
router.get('/patientSignIn',validateDataEncryption(), jwtAuth, PatientController.patientSignIn);
router.post('/notes',validateDataEncryption(), jwtAuth, PatientController.updateNotes);

module.exports = router;