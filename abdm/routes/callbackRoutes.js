const express = require('express');
const router = express.Router();
const { validateAbdmCallback } = require('../middleware/abdmAuth');
const cb = require('../controllers/callbackController');

// ── M2 (HIP) Callbacks ───────────────────────────────────────────────────────
// ABDM calls these when patient interacts with their PHR app or when
// data-flow events occur on care contexts we manage.

router.post('/v3/hip/patient/discover', validateAbdmCallback('m2'), cb.hipPatientDiscover);
router.post('/v3/hip/link/init', validateAbdmCallback('m2'), cb.hipLinkInit);
router.post('/v3/hip/link/confirm', validateAbdmCallback('m2'), cb.hipLinkConfirm);
router.post('/v3/link/on-carecontext', validateAbdmCallback('m2'), cb.onCareContext);
router.post('/v3/consent/hip/on-notify', validateAbdmCallback('m2'), cb.hipConsentNotify);
router.post('/v3/hip/health-information', validateAbdmCallback('m2'), cb.hipHealthInfoRequest);
router.post('/v3/hip/token/on-generate-token', validateAbdmCallback('m2'), cb.hipOnGenerateToken);

// ── M3 (HIU) Callbacks ───────────────────────────────────────────────────────
// ABDM calls these with consent lifecycle events and encrypted health records.

router.post('/v3/hiu/consent/on-init', validateAbdmCallback('m3'), cb.hiuConsentOnInit);
router.post('/v3/hiu/consent/on-status', validateAbdmCallback('m3'), cb.hiuConsentOnStatus);
router.post('/v3/hiu/consent/on-notify', validateAbdmCallback('m3'), cb.hiuConsentOnNotify);
router.post('/v3/hiu/consent/on-fetch', validateAbdmCallback('m3'), cb.hiuConsentOnFetch);
router.post('/v3/hiu/health-information', validateAbdmCallback('m3'), cb.hiuHealthInfoOnRequest);
router.post('/v3/hiu/data-push', validateAbdmCallback('m3'), cb.hiuDataPush);

module.exports = router;
