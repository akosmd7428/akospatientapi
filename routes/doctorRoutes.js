const express = require('express');
const router = express.Router();
const DoctorController = require('../controllers/doctorController');
const jwtAuth = require('../middleware/jwtAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/:employer_id',validateDataEncryption(),jwtAuth, DoctorController.getDoctors);

// Get doctor's availability
router.get('/slot/:doctorId',validateDataEncryption(), jwtAuth, DoctorController.getDoctorAvailability);

module.exports = router;
