const express = require('express');
const router = express.Router();
const m1 = require('../controllers/m1Controller');
const jwtAuth = require('../../middleware/jwtAuth');
const validateDataEncryption = require('../../middleware/validateDataEncryption');

// ── ABHA Creation by Aadhaar OTP ──────────────────────────────
router.post('/aadhaar/otp/init', jwtAuth, validateDataEncryption(), m1.aadhaarOtpInit);
router.post('/aadhaar/otp/verify', jwtAuth, validateDataEncryption(), m1.aadhaarOtpVerify);

// ── Communication Mobile Verification ─────────────────────────
router.post('/mobile/otp/init', jwtAuth, validateDataEncryption(), m1.mobileOtpInit);
router.post('/mobile/otp/verify', jwtAuth, validateDataEncryption(), m1.mobileOtpVerify);

// ── ABHA Address ──────────────────────────────────────────────
router.get('/abha-address/suggestions', jwtAuth, validateDataEncryption(), m1.getAddressSuggestions);
router.post('/abha-address/create', jwtAuth, validateDataEncryption(), m1.createAbhaAddress);

// ── Login (ABHA number, ABHA address, Aadhaar OTP, Mobile) ───
router.post('/login/otp/init', jwtAuth, validateDataEncryption(), m1.loginOtpInit);
router.post('/login/otp/verify', jwtAuth, validateDataEncryption(), m1.loginOtpVerify);
router.post('/login/verify-user', jwtAuth, validateDataEncryption(), m1.loginVerifyUser);

// ── Profile & Card (requires X-token) ────────────────────────
router.get('/profile', jwtAuth, validateDataEncryption(), m1.getProfile);
router.get('/abha-card', jwtAuth, validateDataEncryption(), m1.getAbhaCard);
router.get('/qr-code', jwtAuth, validateDataEncryption(), m1.getQrCode);

// ── Link ABHA to Patient ─────────────────────────────────────
router.post('/link', jwtAuth, validateDataEncryption(), m1.linkAbha);
router.delete('/link', jwtAuth, m1.unlinkAbha);
router.get('/linked', jwtAuth, validateDataEncryption(), m1.getLinkedAbha);

// ── QR Code Parsing ──────────────────────────────────────────
router.post('/qr/parse', jwtAuth, validateDataEncryption(), m1.parseQr);

module.exports = router;
