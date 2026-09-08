const express = require('express');
const AssessmentController = require('../controllers/assessmentController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const validateSchema = require('../middleware/validateSchema');
const PatientAssessmentController = require('../controllers/patientAssessmentController');
const patientAssessmentSchema = require('../validation/patientAssessmentValidator');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/get',validateDataEncryption(),jwtAuth, AssessmentController.getAssessments);
router.get('/detail/:assessmentId',validateDataEncryption(),jwtAuth, AssessmentController.getAssessmentDetails);

router.get('/completed',validateDataEncryption(),jwtAuth, PatientAssessmentController.assessmentTakenByPatient);
router.get('/completedDetails/:assessmentId',validateDataEncryption(), jwtAuth, PatientAssessmentController.getPatientAssessmentsDetails);

router.post('/createBulk',validateDataEncryption(),jwtAuth, PatientAssessmentController.createPatientAssessments);

router.get('/behaviouralHealth/:assessmentId',validateDataEncryption(),jwtAuth, AssessmentController.getBehaviouralDetails);
router.post('/behaviouralHealth',validateDataEncryption(),jwtAuth, PatientAssessmentController.createBehaviouralHealth);

// router.get('/get', jwtAuth, PatientAssessmentController.getPatientAssessments); //Ignore
// router.post('/create', jwtAuth, PatientAssessmentController.createPatientAssessment); //Ignore

module.exports = router;