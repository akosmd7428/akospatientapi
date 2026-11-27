const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const abdmConfig = require('../config/abdmConfig');
const { getToken, logGateway } = require('./gatewayService');
const { HpidAccount } = require('../models');

/**
 * Build standard NHPR V4 headers.
 * All M4 HP-ID calls go to apihspsbx.abdm.gov.in with the same gateway bearer token.
 */
async function buildHprHeaders(extraHeaders = {}) {
  const token = await getToken();
  return {
    'Authorization': `Bearer ${token}`,
    'REQUEST-ID': uuidv4(),
    'TIMESTAMP': new Date().toISOString(),
    'X-CM-ID': 'sbx',
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
}

/**
 * Make an authenticated call to the NHPR V4 service.
 */
async function callHpr(method, path, data, extraHeaders = {}) {
  const headers = await buildHprHeaders(extraHeaders);
  const requestId = headers['REQUEST-ID'];
  const url = `${abdmConfig.hprUrl}${path}`;

  await logGateway(requestId, 'm4', path, 'outgoing', data ? sanitize(data) : null, null, null, null);

  try {
    const config = { method, url, headers, timeout: 30000 };
    if (data && method !== 'get') config.data = data;

    const response = await axios(config);
    await logGateway(requestId, 'm4', path, 'outgoing',
      data ? sanitize(data) : null, response.status, sanitize(response.data), null);
    return { requestId, status: response.status, data: response.data };
  } catch (err) {
    const status = err.response?.status || 0;
    const errData = err.response?.data || { message: err.message };
    const errorCode = errData.code || errData.error?.code || '';
    // Full NHPR error logged here — check backend terminal for root cause
    console.error(`[ABDM M4] NHPR ${method.toUpperCase()} ${path} → ${status}:`, JSON.stringify(errData));
    await logGateway(requestId, 'm4', path, 'outgoing',
      data ? sanitize(data) : null, status, errData, errorCode);
    throw { requestId, status, data: errData, errorCode };
  }
}

function sanitize(data) {
  if (!data || typeof data !== 'object') return data;
  const s = { ...data };
  ['otp', 'otpValue', 'password', 'token', 'accessToken', 'refreshToken'].forEach(k => { if (s[k]) s[k] = '***'; });
  return s;
}

// ═══════════════════════════════════════════════════════════════
// HP-ID REGISTRATION — NEW V4 LINK-BASED AADHAAR FLOW
// ═══════════════════════════════════════════════════════════════

/**
 * Step 1: Generate a hosted ABDM Aadhaar auth link.
 * No Aadhaar number needed from the user — ABDM's page handles that.
 * Returns: { txnId, url, status }
 *   - url: ABDM-hosted page where user enters Aadhaar + OTP
 *   - txnId: used for all subsequent polling/creation calls
 */
async function generateAadhaarLink() {
  return callHpr('post', abdmConfig.m4.hprGenerateLink, {
    scopes: ['nhpr-register'],
    source: 'NHPR',
  });
}

/**
 * Step 2: Poll whether the user has completed Aadhaar auth on ABDM's hosted page.
 * Returns: boolean (true = authenticated, false = still pending)
 */
async function isAadhaarAuthenticated(txnId) {
  return callHpr('post', abdmConfig.m4.hprIsAuthenticated, { txnId });
}

/**
 * Step 3: Retrieve Aadhaar demographic data after successful auth.
 * V2 endpoint — no OTP in request body (auth was done on ABDM's page).
 * Returns: { txnId, name, gender, birthdate, mobileNumber, ... }
 */
async function getAadhaarData(txnId) {
  return callHpr('post', abdmConfig.m4.hprVerifyOtp, { txnId });
}

/**
 * Step 4: Check whether an HP-ID already exists for this Aadhaar.
 * Returns: { new: boolean, hprId?, token?, name?, ... }
 *   - new: false → HP-ID already exists (hprId + token returned)
 *   - new: true  → first-time registration, proceed to suggestions/create
 */
async function checkHpIdExist(txnId) {
  return callHpr('post', abdmConfig.m4.hprCheckExist, {
    txnId,
    preverifiedCheck: true,
  });
}

/**
 * Step 5: Get HP-ID address suggestions (based on verified Aadhaar name).
 * Returns: string[] of suggested HP-IDs (e.g. ["anujsharma"])
 */
async function getHpidSuggestions(txnId) {
  return callHpr('post', abdmConfig.m4.hprIdSuggestion, { txnId });
}

/**
 * Step 6: Create HP-ID with chosen address.
 * Required: txnId, hprId, email
 * Optional: firstName, lastName, password, domainName
 * Returns: { hprId, hprIdNumber, token, name, ... }
 */
async function createHpid(txnId, hprId, email, firstName, lastName, password) {
  const body = {
    txnId,
    hprId,
    email,
    domainName: '@hpr.abdm',
    sourceType: 'AADHAAR',
  };
  if (firstName) body.firstName = firstName;
  if (lastName) body.lastName = lastName;
  if (password) body.password = password;

  return callHpr('post', abdmConfig.m4.hprCreateId, body);
}

// ═══════════════════════════════════════════════════════════════
// HP-ID PROFILE
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch HP-ID profile using the user's HPR access token.
 */
async function getHpidProfile(userToken) {
  const headers = await buildHprHeaders({ 'X-Token': `Bearer ${userToken}` });
  const requestId = headers['REQUEST-ID'];
  const url = `${abdmConfig.hprUrl}${abdmConfig.m4.hprProfile}`;

  try {
    const response = await axios({ method: 'get', url, headers, timeout: 30000 });
    return { requestId, status: response.status, data: response.data };
  } catch (err) {
    const status = err.response?.status || 0;
    throw { requestId, status, data: err.response?.data || { message: err.message } };
  }
}

// ═══════════════════════════════════════════════════════════════
// LINK / GET LINKED HP-ID (database)
// ═══════════════════════════════════════════════════════════════

/**
 * Store linked HP-ID for a portal user.
 * userType: 'doctor' | 'cnavigator' | 'ohcstaff'
 */
async function linkHpid(userId, userType, hprId, hprToken) {
  await HpidAccount.upsert({
    user_id: userId,
    user_type: userType,
    hpr_id: hprId,
    hpr_token: hprToken || null,
    linked_at: new Date(),
  });
  return { hprId, userType };
}

/**
 * Fetch linked HP-ID for a portal user.
 */
async function getLinkedHpid(userId, userType) {
  const account = await HpidAccount.findOne({
    where: { user_id: userId, user_type: userType },
    attributes: ['hpr_id', 'linked_at'],
  });
  return account ? account.toJSON() : null;
}

/**
 * Remove linked HP-ID for a portal user.
 */
async function unlinkHpid(userId, userType) {
  const deleted = await HpidAccount.destroy({
    where: { user_id: userId, user_type: userType },
  });
  return { removed: deleted > 0 };
}

module.exports = {
  generateAadhaarLink,
  isAadhaarAuthenticated,
  getAadhaarData,
  checkHpIdExist,
  getHpidSuggestions,
  createHpid,
  getHpidProfile,
  linkHpid,
  getLinkedHpid,
  unlinkHpid,
};
