const express = require('express');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const validateSchema = require('../middleware/validateSchema');
const PatientAssessmentController = require('../controllers/patientAssessmentController');
const patientAssessmentSchema = require('../validation/patientAssessmentValidator');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/',validateDataEncryption(), jwtAuth, PatientAssessmentController.getPatientAssessments);
router.post('/',validateDataEncryption(),jwtAuth,  validateSchema(patientAssessmentSchema), PatientAssessmentController.createPatientAssessment);
router.post('/bulk',validateDataEncryption(), jwtAuth, PatientAssessmentController.createPatientAssessments);

module.exports = router;