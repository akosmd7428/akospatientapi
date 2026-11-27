const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const abdmConfig = require('../config/abdmConfig');
const GatewayLog = require('../models/gatewayLog');

// In-memory token cache
let tokenCache = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
};

/**
 * Generate ABDM gateway access token.
 * POST /gateway/v3/sessions
 * Returns 202 with { accessToken, expiresIn, refreshToken, tokenType }
 */
async function generateToken() {
  const requestId = uuidv4();
  const timestamp = new Date().toISOString();

  const url = `${abdmConfig.gatewayUrl}/v3/sessions`;
  const headers = {
    'REQUEST-ID': requestId,
    'TIMESTAMP': timestamp,
    'X-CM-ID': 'sbx',
    'Content-Type': 'application/json',
  };
  const body = {
    clientId: abdmConfig.clientId,
    clientSecret: abdmConfig.clientSecret,
    grantType: 'client_credentials',
  };

  // Log outgoing request (sanitize secret from payload)
  const sanitizedBody = { ...body, clientSecret: '***' };
  await logGateway(requestId, 'm1', 'gateway/v3/sessions', 'outgoing', sanitizedBody, null, null, null);

  try {
    const response = await axios.post(url, body, { headers, timeout: 30000 });

    // Cache the token with a 60-second safety margin
    const expiresIn = response.data.expiresIn || 1200;
    tokenCache = {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };

    // Log success (don't log the actual token value)
    await logGateway(requestId, 'm1', 'gateway/v3/sessions', 'outgoing',
      sanitizedBody, response.status, { expiresIn, tokenType: response.data.tokenType }, null);

    return tokenCache.accessToken;
  } catch (err) {
    const status = err.response?.status || 0;
    const errData = err.response?.data || { message: err.message };
    const errorCode = errData.code || errData.error?.code || '';

    await logGateway(requestId, 'm1', 'gateway/v3/sessions', 'outgoing',
      sanitizedBody, status, errData, errorCode);

    throw new Error(`ABDM token generation failed (${status}): ${JSON.stringify(errData)}`);
  }
}

/**
 * Get a valid access token, refreshing if expired.
 */
async function getToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  return generateToken();
}

/**
 * Make an authenticated call to ABDM gateway.
 * Automatically attaches REQUEST-ID, TIMESTAMP, X-CM-ID, Authorization.
 * @param {string} method - HTTP method (post, get, put)
 * @param {string} path - API path (e.g. /v3/hip/link/carecontext)
 * @param {object} data - Request body
 * @param {string} module - m1, m2, m3, m4
 * @param {object} [extraHeaders] - Additional headers (X-HIP-ID etc.)
 * @param {string} [baseUrl] - Override base URL (defaults to abdmConfig.gatewayUrl)
 */
async function callGateway(method, path, data, module, extraHeaders = {}, baseUrl = null) {
  const token = await getToken();
  const requestId = uuidv4();
  const timestamp = new Date().toISOString();

  const url = `${baseUrl || abdmConfig.gatewayUrl}${path}`;
  const headers = {
    'REQUEST-ID': requestId,
    'TIMESTAMP': timestamp,
    'X-CM-ID': 'sbx',
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  // Log outgoing
  await logGateway(requestId, module, path, 'outgoing', data, null, null, null);

  try {
    const response = await axios({ method, url, data, headers, timeout: 30000 });

    await logGateway(requestId, module, path, 'outgoing',
      data, response.status, response.data, null);

    return { requestId, status: response.status, data: response.data };
  } catch (err) {
    const status = err.response?.status || 0;
    const errData = err.response?.data || { message: err.message };
    const errorCode = errData.code || errData.error?.code || '';

    await logGateway(requestId, module, path, 'outgoing',
      data, status, errData, errorCode);

    // If 401, clear token cache and retry once
    if (status === 401 && tokenCache.accessToken) {
      tokenCache = { accessToken: null, refreshToken: null, expiresAt: 0 };
      return callGateway(method, path, data, module, extraHeaders, baseUrl);
    }

    throw { requestId, status, data: errData, errorCode };
  }
}

/**
 * Log a gateway call to the abdm_gateway_logs table.
 */
async function logGateway(requestId, module, operation, direction, requestPayload, responseStatus, responsePayload, errorCode) {
  try {
    await GatewayLog.create({
      request_id: requestId,
      module,
      operation,
      direction,
      request_payload: requestPayload,
      response_status: responseStatus,
      response_payload: responsePayload,
      error_code: errorCode,
    });
  } catch (logErr) {
    // Never let a logging failure break the main flow
    console.error('ABDM audit log write failed:', logErr.message);
  }
}

/**
 * Log an incoming ABDM callback.
 */
async function logCallback(requestId, module, operation, payload) {
  return logGateway(requestId, module, operation, 'incoming_callback', null, 200, payload, null);
}

module.exports = {
  generateToken,
  getToken,
  callGateway,
  logGateway,
  logCallback,
};
