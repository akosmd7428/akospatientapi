const express = require('express');
const PatientController = require('../controllers/patientController');
const AppointmentController = require('../controllers/appointmentController');
const validateDataEncryption = require('../middleware/validateDataEncryption');
const { requireAuth, ROLES } = require('../middleware/requireAuth');

const router = express.Router();

/**
 * SEC-008: all three routes were unauthenticated.
 *
 * POST /prescription/detail wrote a prescription for any patient and is the entry
 * point for the Puppeteer HTML injection in SEC-015. Only clinical staff may
 * author a prescription - a patient must not be able to write their own.
 *
 * GET /prescription returned a full patient record keyed on a `token` query
 * parameter that was simply the patient's email address (SEC-011).
 */
router.post(
    '/prescription/detail',
    requireAuth(ROLES.CARE_NAVIGATOR, ROLES.HR),
    validateDataEncryption(),
    PatientController.savePrescriptionDetails
);

router.get(
    '/prescription',
    requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR),
    validateDataEncryption(),
    PatientController.getPrescriptionDetail
);

router.get(
    '/medicines',
    requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR),
    validateDataEncryption(),
    AppointmentController.getMedicines
);

module.exports = router;
