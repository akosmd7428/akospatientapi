const express = require('express');
const router = express.Router();
const { generateToken } = require('../services/gatewayService');
const { fetchCertificate } = require('../services/encryptionService');
const m1Routes = require('./m1Routes');
const m2Routes = require('./m2Routes');
const m3Routes = require('./m3Routes');
const m4Routes = require('./m4Routes');

// Health check - test ABDM gateway connectivity, credentials and certificate
router.get('/health', async (req, res) => {
  try {
    const token = await generateToken();
    let certStatus = 'unknown';
    try {
      const cert = await fetchCertificate();
      certStatus = cert.publicKey ? 'loaded' : 'missing';
    } catch (certErr) {
      certStatus = `error: ${certErr.message}`;
    }

    res.json({
      status: 'ok',
      gateway: 'connected',
      tokenReceived: !!token,
      certificate: certStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      gateway: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// M1 - ABHA creation, login, profile, linking
router.use('/m1', m1Routes);

// M2 routes — HIP (care context linking + FHIR data transfer)
router.use('/m2', m2Routes);

// M3 routes — HIU (consent requests + health data fetch)
router.use('/m3', m3Routes);

// M4 routes (HP-ID creation for healthcare professionals)
router.use('/m4', m4Routes);

module.exports = router;
