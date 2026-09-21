const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const router = express.Router();
const PatientCareTeamController = require('../controllers/patientCareTeamController');
const { addDoctorsValidation } = require('../validation/patientCareTeamValidation');
const validateSchema = require('../middleware/validateSchema');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/get',requireAuth(ROLES.PATIENT), PatientCareTeamController.getCareTeam);
router.post('/create',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(addDoctorsValidation), PatientCareTeamController.addDoctors);

module.exports = router;
