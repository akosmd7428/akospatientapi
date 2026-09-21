const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const validateSchema = require('../middleware/validateSchema');
const PatientAssessmentController = require('../controllers/patientAssessmentController');
// SEC-027: this imported the MODULE rather than destructuring the schema, so the
// value passed to validateSchema was an object with no .validate method - a
// TypeError on every request to this router. The guard in validateSchema now
// catches this class of mistake at boot instead of at request time.
const { patientAssessmentSchema } = require('../validation/patientAssessmentValidator');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientAssessmentController.getPatientAssessments);
router.post('/',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(patientAssessmentSchema), PatientAssessmentController.createPatientAssessment);
router.post('/bulk',requireAuth(ROLES.PATIENT), validateDataEncryption(), PatientAssessmentController.createPatientAssessments);

module.exports = router;