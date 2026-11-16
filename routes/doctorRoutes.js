const express = require('express');
const router = express.Router();
const DoctorController = require('../controllers/doctorController');
const jwtAuth = require('../middleware/jwtAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/:employer_id', jwtAuth, validateDataEncryption(), DoctorController.getDoctors);

// Get doctor's availability
router.get('/slot/:doctorId', jwtAuth, validateDataEncryption(), DoctorController.getDoctorAvailability);

module.exports = router;
