const express = require('express');
const AssessmentController = require('../controllers/assessmentController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const validateSchema = require('../middleware/validateSchema');
const PatientAssessmentController = require('../controllers/patientAssessmentController');
const patientAssessmentSchema = require('../validation/patientAssessmentValidator');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/get', jwtAuth, validateDataEncryption(), AssessmentController.getAssessments);
router.get('/detail/:assessmentId', jwtAuth, validateDataEncryption(), AssessmentController.getAssessmentDetails);

router.get('/completed', jwtAuth, validateDataEncryption(), PatientAssessmentController.assessmentTakenByPatient);
router.get('/completedDetails/:assessmentId', jwtAuth, validateDataEncryption(), PatientAssessmentController.getPatientAssessmentsDetails);

router.post('/createBulk', jwtAuth, validateDataEncryption(), PatientAssessmentController.createPatientAssessments);

router.get('/behaviouralHealth/:assessmentId', jwtAuth, validateDataEncryption(), AssessmentController.getBehaviouralDetails);
router.post('/behaviouralHealth', jwtAuth, validateDataEncryption(), PatientAssessmentController.createBehaviouralHealth);

// router.get('/get', jwtAuth, PatientAssessmentController.getPatientAssessments); //Ignore
// router.post('/create', jwtAuth, PatientAssessmentController.createPatientAssessment); //Ignore

module.exports = router;