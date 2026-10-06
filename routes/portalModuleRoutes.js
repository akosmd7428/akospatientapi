const express = require('express');
const router = express.Router();
const PortalModuleController = require('../controllers/portalModuleController');
const jwtAuth = require('../middleware/jwtAuth');
const validateDataEncryption = require('../middleware/validateDataEncryption');

router.get('/active', validateDataEncryption(), jwtAuth, PortalModuleController.getActiveModules);

module.exports = router;
