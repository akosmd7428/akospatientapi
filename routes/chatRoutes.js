const express = require('express');
const ChatController = require('../controllers/chatController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const { authorize, ROLES } = require('../middleware/authorize');
const { loadCareNavigatorScope } = require('../middleware/careNavigatorScope');
const router = express.Router();

// patients, doctors and care navigators chat, care navigators also get their companies loaded
const chatAuth = [
    authorize(ROLES.PATIENT, ROLES.DOCTOR, ROLES.CARE_NAVIGATOR),
    (req, res, next) => req.user.role === ROLES.CARE_NAVIGATOR ? loadCareNavigatorScope(req, res, next) : next(),
];

router.post('/initiate-chat',validateDataEncryption(), chatAuth, ChatController.initiateChat);
router.post('/send-message',validateDataEncryption(), chatAuth, ChatController.sendMessage);
router.get('/chat-history',validateDataEncryption(), chatAuth, ChatController.getChatHistory);
router.get('/user-status',validateDataEncryption(), chatAuth, ChatController.getUserStatus);
router.post('/update-user-status',validateDataEncryption(), chatAuth, ChatController.updateUserStatus);
router.get('/chat-list',validateDataEncryption(), chatAuth, ChatController.getChatList);
router.post('/update-read-status',validateDataEncryption(), chatAuth, ChatController.updateReadStatus);
router.get('/searchList',validateDataEncryption(), chatAuth, ChatController.chat);

module.exports = router;
