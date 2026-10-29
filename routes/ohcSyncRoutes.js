const express = require('express');
const router = express.Router();
const OhcSyncController = require('../controllers/ohcSyncController');
const syncApiKeyAuth = require('../middleware/syncApiKeyAuth');

// server to server apis for the ohc backend, plain json (not encrypted), the sync api key is required
router.get('/company-patients', syncApiKeyAuth, OhcSyncController.getCompanyPatients);

module.exports = router;
