const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const router = express.Router();
const DoctorController = require('../controllers/doctorController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/:employer_id',requireAuth(ROLES.PATIENT), validateDataEncryption(), DoctorController.getDoctors);

// Get doctor's availability
router.get('/slot/:doctorId',requireAuth(ROLES.PATIENT), validateDataEncryption(), DoctorController.getDoctorAvailability);

module.exports = router;
