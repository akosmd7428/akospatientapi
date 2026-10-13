// middleware/routeLogger.js
const LogService = require('../helpers/logErrorHelper');
const { verifyLoginToken, getBearerToken } = require('./authorize');

const routeLogger = (req, res, next) => {
  // only used to attribute the log row, authorisation is done by the route middleware
  const decoded = verifyLoginToken(getBearerToken(req));
  const userId = decoded ? decoded.id : null;
  const routeName = req.path;
  const functionName = req.headers['host'] || null;
  const role = decoded ? decoded.role : null;

  // the request body is not logged, it carries credentials and patient data
  LogService.logError(userId, null, routeName, functionName, "API HIT", null, role);

  next();
};

module.exports = routeLogger;
