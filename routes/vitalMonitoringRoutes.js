const express = require('express');
const VitalMonitoringController = require('../controllers/vitalMonitoringController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/get-device', jwtAuth, validateDataEncryption(), VitalMonitoringController.getDevice);
router.get('/get-device-monitoring', jwtAuth, validateDataEncryption(), VitalMonitoringController.getDeviceMonitoring);
router.post('/post-vital-monitoring', jwtAuth, validateDataEncryption(), VitalMonitoringController.postVitalMonitoring);
router.get('/get-detail-monitoring', jwtAuth, validateDataEncryption(), VitalMonitoringController.getDetailMonitoring);
router.get('/view-device-comment', jwtAuth, validateDataEncryption(), VitalMonitoringController.viewDeviceComment);
router.post('/post-device-comment', jwtAuth, validateDataEncryption(), VitalMonitoringController.postDeviceComment);
//router.post('/removeNotification',validateDataEncryption(),jwtAuth, NotificationController.removeNotification);
//router.post('/updateReadNotification',validateDataEncryption(),jwtAuth, NotificationController.updateReadNotification);
module.exports = router;


   