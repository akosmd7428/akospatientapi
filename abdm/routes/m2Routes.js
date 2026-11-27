const express = require('express');
const router = express.Router();
const m2 = require('../controllers/m2Controller');
const jwtAuthCareNavigator = require('../../middleware/jwtAuthCareNavigator');
const { authorize, ROLES } = require('../../middleware/authorize');
const validateDataEncryption = require('../../middleware/validateDataEncryption');

// ── HIP-initiated care context linking ────────────────────────
// Generate a link token for a patient (CN only — AKOS is acting as HIP)
router.post('/link/token', jwtAuthCareNavigator, validateDataEncryption(), m2.generateLinkToken);

// Link a care context to patient's ABHA (CN only)
router.post('/link', jwtAuthCareNavigator, validateDataEncryption(), m2.linkCareContext);

// ── Read care contexts (patient OR care navigator) ─────────────
router.get('/care-contexts/:patientId', authorize(ROLES.PATIENT, ROLES.CARE_NAVIGATOR), validateDataEncryption(), m2.getCareContexts);

module.exports = router;
