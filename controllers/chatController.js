const ChatService = require('../services/chatService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

const ChatController = {

    // Initiate a chat session
    async initiateChat(req, res) {
        const { senderId, receiverId, message } = req.body;

        try {
            const newChat = await ChatService.initiateChat(senderId, receiverId, message);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { chat: newChat  });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    async chat(req, res) {
        const { type, search } = req.query;
        const careCompanyIds = req.header('companyId') || null;
        let list;
        try {
            if(type == 1){ //patient
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
        const { senderId, senderType, receiverId, receiverType, message , messageType, roomId} = req.body;

        try {
            const newMessage = await ChatService.sendMessage(senderId, senderType, receiverId, receiverType, message, messageType, roomId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Message sent", { newMessage } );
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Retrieve chat history between two users
    async getChatHistory(req, res) {
        const { senderId, senderType, receiverId, receiverType } = req.query;

        try {
            const chatHistory = await ChatService.getChatHistory(senderId, senderType, receiverId, receiverType);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, {chatHistory});
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Get the online status of a user
    async getUserStatus(req, res) {
        const { userId, userType } = req.query;

        try {
            const userStatus = await ChatService.getUserStatus(userId, userType);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, {userStatus});
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Update the online status of a user
    async updateUserStatus(req, res) {
        const { userId, userType, isOnline } = req.body;

        try {
            await ChatService.updateUserStatus(userId, userType, isOnline);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "User status updated");
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Get chat list with new message count for the user
    async getChatList(req, res) {
        const { userId, userType, search } = req.query;

        try {
            const chatList = await ChatService.getChatList(userId, userType, search);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, {chatList});
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    },

    // Update the read status of messages
    async updateReadStatus(req, res) {
        const { senderId, senderType, receiverId, receiverType } = req.body;

        try {
            await ChatService.updateReadStatus(senderId, senderType, receiverId, receiverType);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Messages marked as read");
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
};

module.exports = ChatController;
