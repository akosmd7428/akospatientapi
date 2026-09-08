const express = require('express');
const router = express.Router();
const MigrationController = require('../controllers/migrationController');
const syncApiKeyAuth = require('../middleware/syncApiKeyAuth');

router.post('/corporate', syncApiKeyAuth, MigrationController.migrateCorporateData);
router.post('/doctor', syncApiKeyAuth, MigrationController.migrateDoctorData);
router.post('/package', syncApiKeyAuth, MigrationController.migratePackagesData);
router.post('/lab', syncApiKeyAuth, MigrationController.migrateLabData);

module.exports = router;
