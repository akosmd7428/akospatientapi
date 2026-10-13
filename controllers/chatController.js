const ChatService = require('../services/chatService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

const { USER_TYPE, toPositiveInt } = ChatService;
const ROLE_USER_TYPE = { patient: USER_TYPE.PATIENT, doctor: USER_TYPE.DOCTOR, careNavigator: USER_TYPE.CARE_NAVIGATOR };

// the caller is always the token user, client senderId/userId/senderType/userType are ignored
const chatIdentity = (req) => ({ id: req.user.id, userType: ROLE_USER_TYPE[req.user.role] });

const ChatController = {

    // Initiate a chat session
    async initiateChat(req, res) {
        const { receiverId, receiverType, message } = req.body;

        try {
            const me = chatIdentity(req);
            if (!await ChatService.canChat(me.id, me.userType, receiverId, receiverType, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_403_FORBIDDEN, "Access denied");
            }
            const newChat = await ChatService.initiateChat(me.id, receiverId, message);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { chat: newChat  });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    async chat(req, res) {
        const { type, search } = req.query;
        const careCompanyIds = req.careCompanyIds;
        let list = [];
        try {
            if(type == 1 && req.user.role === 'careNavigator'){ //patient, only care navigators search patients of their companies
                list = await ChatService.chat(type, search,careCompanyIds);
            }
            if(type == 2){ //Doctor
                list = await ChatService.chat(type, search,careCompanyIds);
            }
            if(type == 3){ //careNavigator
                list = await ChatService.chat(type, search,careCompanyIds);
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { list  });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Send a message from one user to another
    async sendMessage(req, res) {
        const { receiverId, receiverType, message , messageType} = req.body;

        try {
            const me = chatIdentity(req);
            if (!await ChatService.canChat(me.id, me.userType, receiverId, receiverType, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_403_FORBIDDEN, "Access denied");
            }
            const toId = toPositiveInt(receiverId);
            const toType = toPositiveInt(receiverType);
            const roomId = `${me.id}_${me.userType}_${toId}_${toType}`;
            const newMessage = await ChatService.sendMessage(me.id, me.userType, toId, toType, message, messageType, roomId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Message sent", { newMessage } );
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Retrieve chat history between two users
    async getChatHistory(req, res) {
        const { receiverId, receiverType } = req.query;

        try {
            const me = chatIdentity(req);
            const toId = toPositiveInt(receiverId);
            const toType = toPositiveInt(receiverType);
            if (!toId || !toType) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Invalid receiver");
            }
            // types stay strings like the query values were, keeps the existing 7 day history window
            const chatHistory = await ChatService.getChatHistory(me.id, String(me.userType), toId, String(toType));
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, {chatHistory});
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Get the online status of a user
    async getUserStatus(req, res) {
        const { userId, userType } = req.query;

        try {
            const id = toPositiveInt(userId);
            const type = toPositiveInt(userType);
            if (!id || !type) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Invalid user");
            }
            const userStatus = await ChatService.getUserStatus(id, type);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, {userStatus});
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Update the online status of a user
    async updateUserStatus(req, res) {
        const { isOnline } = req.body;

        try {
            const me = chatIdentity(req);
            await ChatService.updateUserStatus(me.id, me.userType, !!isOnline && isOnline !== 'false' && isOnline !== '0');
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "User status updated");
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Get chat list with new message count for the user
    async getChatList(req, res) {
        const { search } = req.query;

        try {
            const me = chatIdentity(req);
            const chatList = await ChatService.getChatList(me.id, me.userType, typeof search === 'string' ? search : '');
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, {chatList});
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Update the read status of messages
    async updateReadStatus(req, res) {
        const { receiverId, receiverType } = req.body;

        try {
            const me = chatIdentity(req);
            const toId = toPositiveInt(receiverId);
            const toType = toPositiveInt(receiverType);
            if (!toId || !toType) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Invalid receiver");
            }
            await ChatService.updateReadStatus(me.id, me.userType, toId, toType);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Messages marked as read");
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
};

module.exports = ChatController;
