const express = require('express');
const router = express.Router();
const OhcSyncController = require('../controllers/ohcSyncController');
const syncApiKeyAuth = require('../middleware/syncApiKeyAuth');

// server to server apis for the ohc backend, plain json (not encrypted), the sync api key is required
router.get('/company-patients', syncApiKeyAuth, OhcSyncController.getCompanyPatients);
router.post('/create-patient', syncApiKeyAuth, OhcSyncController.createPatient);

// vital monitoring, same as /vital-monitoring but the patient_id comes in the request
router.get('/get-device', syncApiKeyAuth, OhcSyncController.getDevice);
router.get('/get-device-monitoring', syncApiKeyAuth, OhcSyncController.getDeviceMonitoring);
router.post('/post-vital-monitoring', syncApiKeyAuth, OhcSyncController.postVitalMonitoring);
router.get('/get-detail-monitoring', syncApiKeyAuth, OhcSyncController.getDetailMonitoring);
router.get('/view-device-comment', syncApiKeyAuth, OhcSyncController.viewDeviceComment);
router.post('/post-device-comment', syncApiKeyAuth, OhcSyncController.postDeviceComment);

module.exports = router;
