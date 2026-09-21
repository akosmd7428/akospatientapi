const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const VitalMonitoringController = require('../controllers/vitalMonitoringController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/get-device',requireAuth(ROLES.PATIENT), validateDataEncryption(), VitalMonitoringController.getDevice);
router.get('/get-device-monitoring',requireAuth(ROLES.PATIENT), validateDataEncryption(), VitalMonitoringController.getDeviceMonitoring);
router.post('/post-vital-monitoring',requireAuth(ROLES.PATIENT), validateDataEncryption(), VitalMonitoringController.postVitalMonitoring);
router.get('/get-detail-monitoring',requireAuth(ROLES.PATIENT), validateDataEncryption(), VitalMonitoringController.getDetailMonitoring);
router.get('/view-device-comment',requireAuth(ROLES.PATIENT), validateDataEncryption(), VitalMonitoringController.viewDeviceComment);
router.post('/post-device-comment',requireAuth(ROLES.PATIENT), validateDataEncryption(), VitalMonitoringController.postDeviceComment);
//router.post('/removeNotification',validateDataEncryption(),requireAuth(ROLES.PATIENT), NotificationController.removeNotification);
//router.post('/updateReadNotification',validateDataEncryption(),requireAuth(ROLES.PATIENT), NotificationController.updateReadNotification);
module.exports = router;


   