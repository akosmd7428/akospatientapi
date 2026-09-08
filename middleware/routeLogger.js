// middleware/routeLogger.js
const LogService = require('../helpers/logErrorHelper');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secret');

const routeLogger = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '').trim();
  // A JWT has exactly three dot-separated segments — skip anything else
  // (e.g. sync-api keys, opaque tokens) so we don't spam the log with
  // "jwt malformed" for non-JWT auth schemes.
  if (token && token.split('.').length === 3) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // ignore — token belongs to a different scheme or is invalid
    }
  }
  const userId = req.user ? req.user.id : null; // Assuming you have user info in the request
  const routeName = req.originalUrl;
  const functionName = req.headers['host']|| null;
  const role = req.headers['role'] || null;

  // Log the route access
  LogService.logError(userId, null, routeName, functionName, "API HIT", JSON.stringify(req.body), role);

  next();
};

module.exports = routeLogger;
