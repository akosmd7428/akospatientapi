const express = require('express');
const ChatController = require('../controllers/chatController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.post('/initiate-chat',validateDataEncryption(), ChatController.initiateChat);
router.post('/send-message',validateDataEncryption(), ChatController.sendMessage);
router.get('/chat-history',validateDataEncryption(), ChatController.getChatHistory);
router.get('/user-status',validateDataEncryption(), ChatController.getUserStatus);
router.post('/update-user-status',validateDataEncryption(), ChatController.updateUserStatus);
router.get('/chat-list',validateDataEncryption(), ChatController.getChatList);
router.post('/update-read-status',validateDataEncryption(), ChatController.updateReadStatus);
router.get('/searchList',validateDataEncryption(), ChatController.chat);

module.exports = router;
