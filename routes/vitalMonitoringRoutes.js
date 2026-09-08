const express = require('express');
const VitalMonitoringController = require('../controllers/vitalMonitoringController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/get-device',validateDataEncryption(),jwtAuth, VitalMonitoringController.getDevice);
router.get('/get-device-monitoring',validateDataEncryption(),jwtAuth, VitalMonitoringController.getDeviceMonitoring);
router.post('/post-vital-monitoring',validateDataEncryption(),jwtAuth, VitalMonitoringController.postVitalMonitoring);
router.get('/get-detail-monitoring',validateDataEncryption(),jwtAuth, VitalMonitoringController.getDetailMonitoring);
router.get('/view-device-comment',validateDataEncryption(),jwtAuth, VitalMonitoringController.viewDeviceComment);
router.post('/post-device-comment',validateDataEncryption(),jwtAuth, VitalMonitoringController.postDeviceComment);
//router.post('/removeNotification',validateDataEncryption(),jwtAuth, NotificationController.removeNotification);
//router.post('/updateReadNotification',validateDataEncryption(),jwtAuth, NotificationController.updateReadNotification);
module.exports = router;


   