const ConnectAccessService = require('../services/connectAccessService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

class ConnectAccessController {
    // one time code the logged-in patient must verify before getting the connect-api token
    static async generateCode(req, res) {
        try {
            const { code, expiresIn } = await ConnectAccessService.generateCode(req.user.id);
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.connect_code_generated, { code, expires_in: expiresIn });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    // verify the code, then give the connect-api token
    static async verifyCode(req, res) {
        try {
            const isValidCode = await ConnectAccessService.verifyCode(req.user.id, req.body.code);
            if (!isValidCode) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_401_UNAUTHORIZED, messages.connect_invalid_code);
            }
            const accessToken = await ConnectAccessService.getConnectToken(req.user.id);
            if (!accessToken) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, 'Unable to get call token');
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { access_token: accessToken });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
}

module.exports = ConnectAccessController;
