const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const validateSchema = require('../middleware/validateSchema');
const PatientAssessmentController = require('../controllers/patientAssessmentController');
const patientAssessmentSchema = require('../validation/patientAssessmentValidator');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientAssessmentController.getPatientAssessments);
router.post('/',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(patientAssessmentSchema), PatientAssessmentController.createPatientAssessment);
router.post('/bulk',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientAssessmentController.createPatientAssessments);

module.exports = router;