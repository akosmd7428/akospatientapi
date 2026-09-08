const opentokService = require('../services/opentokService');
const { messages } = require('../config/language');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');

const generateSession = async (req, res) => {
    try {
    const sessionId = await opentokService.createSession();
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { sessionId:sessionId});
    } catch (error) {
    return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
};

const generateToken = (req, res) => {
  const sessionId = req.query.sessionId;
  const role = req.query.role || 'publisher'; // Default role is 'publisher'
  const data = req.query.data || ''; // Optional data

  if (!sessionId) {
    return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Session ID is required");
  }

  const token = opentokService.generateToken(sessionId, role, data);
    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { token:token});
};


module.exports = {
  generateSession,
  generateToken
};
