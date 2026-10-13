// middleware/errorHandler.js
const LogService = require('../helpers/logErrorHelper');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const { verifyLoginToken, getBearerToken } = require('./authorize');
const { redact } = require('../helpers/redact');

const errorHandler = (err, req, res, next) => {
  const decoded = req.user || verifyLoginToken(getBearerToken(req));
  const userId = decoded ? decoded.id : null;
  const role = decoded ? decoded.role : null;
  const routeName = req.path;
  const functionName = req.headers['host'] || null;
  const lineNumber = err && err.stack ? err.stack.split('\n')[1] : 'Unknown';
  const errorMessage = err ? err.message : 'Unknown error';

  LogService.logError(userId, errorMessage, routeName, functionName, lineNumber, JSON.stringify(redact(req.body)), role);

  if (res.headersSent) {
    return next(err);
  }
  // body-parser errors carry a 4xx status, everything else is a server error with no internals in the response
  const status = err && err.status >= 400 && err.status < 500 ? err.status : STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR;
  const message = status === STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR ? messages.serverError : 'Invalid request';
  return CommonHelper.sendError(res, status, message);
};

module.exports = errorHandler;
