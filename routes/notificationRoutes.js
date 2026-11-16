const express = require('express');
const NotificationController = require('../controllers/notificationController');
const { authorize, ROLES } = require('../middleware/authorize');
// notifications are read by the patient, care navigator and hr portals, every handler is scoped to req.user
const portalUsers = authorize(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR);
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.post('/notifications', portalUsers, validateDataEncryption(), NotificationController.createNotification);
router.get('/notifications', portalUsers, validateDataEncryption(), NotificationController.getNotifications);
router.post('/removeNotification', portalUsers, validateDataEncryption(), NotificationController.removeNotification);
router.post('/updateReadNotification', portalUsers, validateDataEncryption(), NotificationController.updateReadNotification);

module.exports = router;
