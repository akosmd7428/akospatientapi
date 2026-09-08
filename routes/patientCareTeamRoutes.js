const express = require('express');
const router = express.Router();
const PatientCareTeamController = require('../controllers/patientCareTeamController');
const { addDoctorsValidation } = require('../validation/patientCareTeamValidation');
const validateSchema = require('../middleware/validateSchema');
const jwtAuth = require('../middleware/jwtAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/get',jwtAuth, PatientCareTeamController.getCareTeam);
router.post('/create',validateDataEncryption(),jwtAuth, validateSchema(addDoctorsValidation), PatientCareTeamController.addDoctors);

module.exports = router;
