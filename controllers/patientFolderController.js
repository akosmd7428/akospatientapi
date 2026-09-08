const patientFolderService = require('../services/patientFolderService');
const { sendError, sendSuccess } = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');
const { messages } = require('../config/language');

class patientFolderController {
    static async getFolders(req, res) {
        try {
            const { page = 1, search } = req.query;
            const patientId = req.user.id;

            const folders = await patientFolderService.getFolders(patientId, page, search);

            return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.folderFetched, { folders });
        } catch (error) {
            return sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getFiles(req, res) {
        try {
            const { folderId, timeFilter = 0, search } = req.query;
            const patientId = req.user.id;

            const files = await patientFolderService.getFiles(patientId, folderId, timeFilter, search);

            return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.filesFetched, { files });
        } catch (error) {
            return sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
}

module.exports = patientFolderController;
