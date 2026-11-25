const express = require('express');
const router = express.Router();
const { validateAbdmCallback } = require('../middleware/abdmAuth');

// M2 (HIP) Callbacks - ABDM calls these when it has results for our requests
router.post('/v3/hip/patient/discover', validateAbdmCallback('m2'), (req, res) => {
  // TODO: Phase 3 - Handle patient discovery request
  // For now, acknowledge receipt
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/hip/link/init', validateAbdmCallback('m2'), (req, res) => {
  // TODO: Phase 3 - Handle user-initiated link start
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/hip/link/confirm', validateAbdmCallback('m2'), (req, res) => {
  // TODO: Phase 3 - Handle user-initiated link confirm
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/link/on-carecontext', validateAbdmCallback('m2'), (req, res) => {
  // TODO: Phase 3 - Handle care context link result
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/consent/hip/on-notify', validateAbdmCallback('m2'), (req, res) => {
  // TODO: Phase 3 - Handle consent notification (HIP side)
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/hip/health-information', validateAbdmCallback('m2'), (req, res) => {
  // TODO: Phase 3 - Handle health info request (HIP side)
  res.status(202).json({ status: 'acknowledged' });
});

// M3 (HIU) Callbacks - ABDM calls these with consent and data transfer results
router.post('/v3/hiu/consent/on-init', validateAbdmCallback('m3'), (req, res) => {
  // TODO: Phase 4 - Handle consent request accepted
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/hiu/consent/on-status', validateAbdmCallback('m3'), (req, res) => {
  // TODO: Phase 4 - Handle consent status update
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/hiu/consent/on-notify', validateAbdmCallback('m3'), (req, res) => {
  // TODO: Phase 4 - Handle consent grant/revoke
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/hiu/consent/on-fetch', validateAbdmCallback('m3'), (req, res) => {
  // TODO: Phase 4 - Handle consent artefact detail
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/hiu/health-information', validateAbdmCallback('m3'), (req, res) => {
  // TODO: Phase 4 - Handle health info acknowledgement
  res.status(202).json({ status: 'acknowledged' });
});

router.post('/v3/hiu/data-push', validateAbdmCallback('m3'), (req, res) => {
  // TODO: Phase 4 - Handle encrypted records arrival
  res.status(202).json({ status: 'acknowledged' });
});

module.exports = router;
