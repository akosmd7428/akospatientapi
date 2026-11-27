const express = require('express');
const router = express.Router();
const m4 = require('../controllers/m4Controller');
const jwtAuthCareNavigator = require('../../middleware/jwtAuthCareNavigator');
const validateDataEncryption = require('../../middleware/validateDataEncryption');

// M4 HP-ID endpoints: care navigator only (doctor + OHC portals have their own backends)

// ── HP-ID Creation: link-based Aadhaar flow (NHPR V4) ─────────
// Step 1: generate ABDM-hosted Aadhaar auth link (no Aadhaar number sent from client)
router.post('/aadhaar/link/init', jwtAuthCareNavigator, validateDataEncryption(), m4.aadhaarLinkInit);
// Step 2: poll auth status after user completes OTP on ABDM's page
router.post('/aadhaar/link/poll', jwtAuthCareNavigator, validateDataEncryption(), m4.aadhaarLinkPoll);

// ── HP-ID Address ──────────────────────────────────────────────
router.get('/hpid/suggestions', jwtAuthCareNavigator, validateDataEncryption(), m4.hpidSuggestions);
router.post('/hpid/create', jwtAuthCareNavigator, validateDataEncryption(), m4.createHpid);

// ── Profile ───────────────────────────────────────────────────
router.get('/profile', jwtAuthCareNavigator, validateDataEncryption(), m4.getProfile);

// ── Link / Unlink HP-ID ───────────────────────────────────────
router.post('/link', jwtAuthCareNavigator, validateDataEncryption(), m4.linkHpid);
router.get('/linked', jwtAuthCareNavigator, validateDataEncryption(), m4.getLinkedHpid);
router.delete('/linked', jwtAuthCareNavigator, validateDataEncryption(), m4.unlinkHpid);

module.exports = router;
