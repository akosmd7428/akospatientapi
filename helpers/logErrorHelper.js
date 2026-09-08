const Logs = require('../models/logsModel');

async function logError(userId, errorMessage, fileName, functionName, lineNumber, additionalData,role) {
    try {
      await Logs.create({
        userId,
        errorMessage,
        fileName,
        functionName,
        lineNumber,
        additionalData,
        role
      });
      console.log('Error logged successfully');
    } catch (error) {
      console.error('Error logging the error:', error);
    }
}

module.exports = { logError };
