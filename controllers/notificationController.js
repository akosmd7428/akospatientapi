const NotificationService = require('../services/notificationService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

class NotificationController {
    
    static async createNotification(req, res) {
        try {
            const { data } = req.body;
            const result = await NotificationService.createNotification(data);
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.notificationCreated, { result });
    } catch (error) {
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
    }

    static async getNotifications(req, res) {
        try {
            const { role, referenceId, filter = 'all' } = req.query;
            const notifications = await NotificationService.getNotifications(role, referenceId, filter);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.notificationFetched, { notifications });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async removeNotification(req, res) {
        try {
            const { notificationId } = req.body;
            const notification = await NotificationService.removeNotification(notificationId);
            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.notificationDeleted, { notification });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateReadNotification(req, res) {
        try {
            const { role, referenceId } = req.body;
            const notification = await NotificationService.updateReadNotification(referenceId, role);
            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Notifications updated successfully", { notification });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

}

module.exports = NotificationController;
