// middleware/errorHandler.js
const LogService = require('../helpers/logErrorHelper');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secret');

const errorHandler = (err, req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const userId = req.user ? req.user.id : null; // Assuming you have user info in the request
  const routeName = req.originalUrl;
  const functionName = req.headers['host']|| null;
  const lineNumber = err.stack ? err.stack.split('\n')[1] : 'Unknown'; // Extract the line number from the stack trace
  const errorMessage = err.message;
  const additionalData = req.body; // You can log request data if needed
  const role = req.headers['role'] || null;

  if(token){
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
    } catch (error) {
        LogService.logError(userId, error.message, routeName, functionName, lineNumber, JSON.stringify(additionalData), role);
        next();
    }
  }
 
  // Log the error
  LogService.logError(userId, errorMessage, routeName, functionName, lineNumber, JSON.stringify(additionalData), role);
};

module.exports = errorHandler;