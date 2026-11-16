const express = require('express');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const validateSchema = require('../middleware/validateSchema');
const PatientAssessmentController = require('../controllers/patientAssessmentController');
const { patientAssessmentSchema } = require('../validation/patientAssessmentValidator');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/', jwtAuth, validateDataEncryption(), PatientAssessmentController.getPatientAssessments);
router.post('/', jwtAuth, validateDataEncryption(),  validateSchema(patientAssessmentSchema), PatientAssessmentController.createPatientAssessment);
router.post('/bulk', jwtAuth, validateDataEncryption(), PatientAssessmentController.createPatientAssessments);

module.exports = router;