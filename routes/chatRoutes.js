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

router.post('/initiate-chat', chatAuth, validateDataEncryption(), ChatController.initiateChat);
router.post('/send-message', chatAuth, validateDataEncryption(), ChatController.sendMessage);
router.get('/chat-history', chatAuth, validateDataEncryption(), ChatController.getChatHistory);
router.get('/user-status', chatAuth, validateDataEncryption(), ChatController.getUserStatus);
router.post('/update-user-status', chatAuth, validateDataEncryption(), ChatController.updateUserStatus);
router.get('/chat-list', chatAuth, validateDataEncryption(), ChatController.getChatList);
router.post('/update-read-status', chatAuth, validateDataEncryption(), ChatController.updateReadStatus);
router.get('/searchList', chatAuth, validateDataEncryption(), ChatController.chat);

module.exports = router;
