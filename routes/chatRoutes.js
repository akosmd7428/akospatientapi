const express = require('express');
const ChatController = require('../controllers/chatController');
const validateDataEncryption = require('../middleware/validateDataEncryption');
const { requireAuth, ROLES } = require('../middleware/requireAuth');

const router = express.Router();

/**
 * SEC-008: none of these eight endpoints carried any authentication. They return
 * and accept clinician-patient chat content, with senderId and receiverId chosen
 * by the caller, so anyone could read or write any conversation.
 *
 * validateDataEncryption() was presumably treated as the gate. It is not one -
 * the key was committed to git (SEC-004) and the server would encrypt arbitrary
 * payloads on request (SEC-005).
 *
 * SEC-006: /searchList and /chat-list are also the SQL injection sinks.
 */
const anyUser = requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR);

router.post('/initiate-chat', anyUser, validateDataEncryption(), ChatController.initiateChat);
router.post('/send-message', anyUser, validateDataEncryption(), ChatController.sendMessage);
router.get('/chat-history', anyUser, validateDataEncryption(), ChatController.getChatHistory);
router.get('/user-status', anyUser, validateDataEncryption(), ChatController.getUserStatus);
router.post('/update-user-status', anyUser, validateDataEncryption(), ChatController.updateUserStatus);
router.get('/chat-list', anyUser, validateDataEncryption(), ChatController.getChatList);
router.post('/update-read-status', anyUser, validateDataEncryption(), ChatController.updateReadStatus);
router.get('/searchList', requireAuth(ROLES.CARE_NAVIGATOR, ROLES.HR), validateDataEncryption(), ChatController.chat);

module.exports = router;
