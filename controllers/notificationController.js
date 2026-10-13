const NotificationService = require('../services/notificationService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

class NotificationController {
    
    static async createNotification(req, res) {
        try {
            const { data } = req.body;
            // a user can only create a notification for themselves, never for another user or role
            const title = data && typeof data.title === 'string' ? data.title.slice(0, 255) : '';
            const description = data && typeof data.description === 'string' ? data.description.slice(0, 2000) : '';
            if (!title) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, 'title is required');
            }
            const result = await NotificationService.createNotification({ title, description, referenceId: req.user.id, role: req.user.role });
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.notificationCreated, { result });
    } catch (error) {
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
    }

    static async getNotifications(req, res) {
        try {
            // role and referenceId sent by the frontends are ignored, the caller only sees their own notifications
            const { filter = 'all' } = req.query;
            const notifications = await NotificationService.getNotifications(req.user.role, req.user.id, filter);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.notificationFetched, { notifications });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async removeNotification(req, res) {
        try {
            const { notificationId } = req.body;
            const notification = await NotificationService.removeNotification(notificationId, req.user.id, req.user.role);
            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.notificationDeleted, { notification });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateReadNotification(req, res) {
        try {
            const notification = await NotificationService.updateReadNotification(req.user.id, req.user.role);
            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Notifications updated successfully", { notification });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

}

module.exports = NotificationController;
