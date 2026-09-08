const express = require('express');
const NotificationController = require('../controllers/notificationController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.post('/notifications',validateDataEncryption(),jwtAuth, NotificationController.createNotification);
router.get('/notifications',validateDataEncryption(),jwtAuth, NotificationController.getNotifications);
router.post('/removeNotification',validateDataEncryption(),jwtAuth, NotificationController.removeNotification);
router.post('/updateReadNotification',validateDataEncryption(),jwtAuth, NotificationController.updateReadNotification);

module.exports = router;
