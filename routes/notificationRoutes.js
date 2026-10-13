const express = require('express');
const NotificationController = require('../controllers/notificationController');
const { authorize, ROLES } = require('../middleware/authorize');
// notifications are read by the patient, care navigator and hr portals, every handler is scoped to req.user
const portalUsers = authorize(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR);
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.post('/notifications',validateDataEncryption(),portalUsers, NotificationController.createNotification);
router.get('/notifications',validateDataEncryption(),portalUsers, NotificationController.getNotifications);
router.post('/removeNotification',validateDataEncryption(),portalUsers, NotificationController.removeNotification);
router.post('/updateReadNotification',validateDataEncryption(),portalUsers, NotificationController.updateReadNotification);

module.exports = router;
