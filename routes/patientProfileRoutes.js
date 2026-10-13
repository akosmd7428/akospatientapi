const express = require('express');
// const PatientProfileController = require('../controllers/patientProfileController');
const PatientController = require('../controllers/patientController');
// const validateSchema = require('../middleware/validateSchema');
// const { profileSchema } = require('../validation/patientProfileValidation');
const jwtAuth = require('../middleware/jwtAuth');
const { authorize, ROLES } = require('../middleware/authorize');
const { loadCareNavigatorScope } = require('../middleware/careNavigatorScope');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

// care navigators only get the companies they manage loaded, patients pass straight through
const careNavigatorScope = (req, res, next) => (
    req.user.role === ROLES.CARE_NAVIGATOR ? loadCareNavigatorScope(req, res, next) : next()
);

router.get('/profile',validateDataEncryption(),jwtAuth, PatientController.getPatientProfileDetails);
router.post('/profile',validateDataEncryption(), jwtAuth, PatientController.createOrUpdateProfile);
// pre-login check on the patient login page, returns only a status message (no patient data)
router.get('/details/:patientEmail',validateDataEncryption(), PatientController.getPatientDetails);
router.post('/updateProfile',validateDataEncryption(), authorize(ROLES.PATIENT, ROLES.CARE_NAVIGATOR), careNavigatorScope, PatientController.updateProfile);
router.get('/patientSignIn',validateDataEncryption(), jwtAuth, PatientController.patientSignIn);
router.post('/notes',validateDataEncryption(), jwtAuth, PatientController.updateNotes);

module.exports = router;
