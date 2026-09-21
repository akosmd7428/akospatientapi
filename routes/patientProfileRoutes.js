const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
// const PatientProfileController = require('../controllers/patientProfileController');
const PatientController = require('../controllers/patientController');
// const validateSchema = require('../middleware/validateSchema');
// const { profileSchema } = require('../validation/patientProfileValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/profile',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientController.getPatientProfileDetails);
router.post('/profile',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientController.createOrUpdateProfile);
router.get('/details/:patientEmail',validateDataEncryption(), PatientController.getPatientDetails);
router.post('/updateProfile',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientController.updateProfile);
router.get('/patientSignIn',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientController.patientSignIn);
router.post('/notes',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientController.updateNotes);

module.exports = router;