const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const NotificationController = require('../controllers/notificationController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.post('/notifications',requireAuth(ROLES.PATIENT), validateDataEncryption(), NotificationController.createNotification);
router.get('/notifications',requireAuth(ROLES.PATIENT), validateDataEncryption(), NotificationController.getNotifications);
router.post('/removeNotification',requireAuth(ROLES.PATIENT), validateDataEncryption(), NotificationController.removeNotification);
router.post('/updateReadNotification',requireAuth(ROLES.PATIENT), validateDataEncryption(), NotificationController.updateReadNotification);

module.exports = router;
