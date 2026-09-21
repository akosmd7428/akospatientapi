const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const AssessmentController = require('../controllers/assessmentController');
const validateSchema = require('../middleware/validateSchema');
const PatientAssessmentController = require('../controllers/patientAssessmentController');
const patientAssessmentSchema = require('../validation/patientAssessmentValidator');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/get',requireAuth(ROLES.PATIENT), validateDataEncryption(), AssessmentController.getAssessments);
router.get('/detail/:assessmentId',requireAuth(ROLES.PATIENT), validateDataEncryption(), AssessmentController.getAssessmentDetails);

router.get('/completed',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientAssessmentController.assessmentTakenByPatient);
router.get('/completedDetails/:assessmentId',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientAssessmentController.getPatientAssessmentsDetails);

router.post('/createBulk',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientAssessmentController.createPatientAssessments);

router.get('/behaviouralHealth/:assessmentId',requireAuth(ROLES.PATIENT), validateDataEncryption(), AssessmentController.getBehaviouralDetails);
router.post('/behaviouralHealth',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientAssessmentController.createBehaviouralHealth);

// router.get('/get', requireAuth(ROLES.PATIENT), PatientAssessmentController.getPatientAssessments); //Ignore
// router.post('/create', requireAuth(ROLES.PATIENT), PatientAssessmentController.createPatientAssessment); //Ignore

module.exports = router;