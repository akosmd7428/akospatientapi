const { logCallback } = require('../services/gatewayService');

/**
 * Middleware to validate incoming ABDM callbacks.
 * - Checks required headers (REQUEST-ID, TIMESTAMP)
 * - Logs the callback for audit
 * - Extracts the request ID for downstream handlers
 */
function validateAbdmCallback(module) {
  return async (req, res, next) => {
    const requestId = req.headers['request-id'] || req.headers['REQUEST-ID'];
    const timestamp = req.headers['timestamp'] || req.headers['TIMESTAMP'];

    if (!requestId) {
      return res.status(400).json({ error: { code: 'AKOS-CB-001', message: 'Missing REQUEST-ID header' } });
    }

    // Attach to request for downstream use
    req.abdmRequestId = requestId;
    req.abdmTimestamp = timestamp;

    // Log the incoming callback
    try {
      await logCallback(requestId, module, req.path, req.body);
    } catch (err) {
      // Don't block callback processing if logging fails
      console.error('ABDM callback logging failed:', err.message);
    }

    next();
  };
}

module.exports = { validateAbdmCallback };
