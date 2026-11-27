const express = require('express');
const router = express.Router();
const m3 = require('../controllers/m3Controller');
const jwtAuthCareNavigator = require('../../middleware/jwtAuthCareNavigator');
const validateDataEncryption = require('../../middleware/validateDataEncryption');

// All M3 (HIU) routes are care navigator only — CNs request records on behalf of patients.

// ── Consent requests ──────────────────────────────────────────
// Initiate a new consent request
router.post('/consent/request', jwtAuthCareNavigator, validateDataEncryption(), m3.initiateConsentRequest);

// Get all consent requests for a patient
router.get('/consent/:patientId', jwtAuthCareNavigator, validateDataEncryption(), m3.getConsentRequests);

// Delete a consent request from local DB
router.delete('/consent/:id', jwtAuthCareNavigator, validateDataEncryption(), m3.deleteConsentRequest);

// ── Health info transfer ──────────────────────────────────────
// Trigger health data pull using a granted consent artefact
router.post('/health-info/request', jwtAuthCareNavigator, validateDataEncryption(), m3.requestHealthInfo);

// Get received health records for a patient
router.get('/records/:patientId', jwtAuthCareNavigator, validateDataEncryption(), m3.getReceivedRecords);

module.exports = router;
