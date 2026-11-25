const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const abdmConfig = require('../config/abdmConfig');
const { getToken } = require('./gatewayService');
const { rsaEncrypt, clearCertCache } = require('./encryptionService');
const { logGateway } = require('./gatewayService');
const { AbhaAccount } = require('../models');

/**
 * Build standard ABDM headers for ABHA service calls.
 * M1 calls go to the ABHA service (abhasbx.abdm.gov.in), not the gateway.
 * But they still carry the gateway access token in Authorization.
 */
async function buildHeaders(extraHeaders = {}) {
  const token = await getToken();
  return {
    'Authorization': `Bearer ${token}`,
    'REQUEST-ID': uuidv4(),
    'TIMESTAMP': new Date().toISOString(),
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
}

/**
 * Make an authenticated call to the ABHA service.
 * @param {string} method - HTTP method
 * @param {string} path - API path on the ABHA service
 * @param {object|null} data - Request body (null for GET)
 * @param {object} extraHeaders - Additional headers (X-token, TRANSACTION_ID, etc.)
 */
async function callAbha(method, path, data, extraHeaders = {}) {
  const headers = await buildHeaders(extraHeaders);
  const requestId = headers['REQUEST-ID'];
  const url = `${abdmConfig.abhaUrl}${path}`;

  // Log outgoing (sanitize sensitive data)
  const sanitizedData = data ? sanitizePayload(data) : null;
  await logGateway(requestId, 'm1', path, 'outgoing', sanitizedData, null, null, null);

  try {
    const config = { method, url, headers, timeout: 30000 };
    if (data && method !== 'get') config.data = data;

    const response = await axios(config);

    // Log success (sanitize tokens from response)
    await logGateway(requestId, 'm1', path, 'outgoing',
      sanitizedData, response.status, sanitizePayload(response.data), null);

    return { requestId, status: response.status, data: response.data };
  } catch (err) {
    const status = err.response?.status || 0;
    const errData = err.response?.data || { message: err.message };
    const errorCode = errData.code || errData.error?.code || '';

    await logGateway(requestId, 'm1', path, 'outgoing',
      sanitizedData, status, errData, errorCode);

    throw { requestId, status, data: errData, errorCode };
  }
}

/**
 * Remove sensitive values from payloads before logging.
 */
function sanitizePayload(data) {
  if (!data || typeof data !== 'object') return data;
  const sanitized = { ...data };
  // Never log these fields
  const sensitiveKeys = ['loginId', 'otpValue', 'otp', 'password', 'token', 'refreshToken', 'accessToken', 'profilePhoto'];
  for (const key of sensitiveKeys) {
    if (sanitized[key]) sanitized[key] = '***';
  }
  if (sanitized.authData?.otp?.otpValue) {
    sanitized.authData = { ...sanitized.authData, otp: { ...sanitized.authData.otp, otpValue: '***' } };
  }
  if (sanitized.tokens) {
    sanitized.tokens = { token: '***', refreshToken: '***', expiresIn: sanitized.tokens.expiresIn };
  }
  if (sanitized.ABHAProfile?.profilePhoto) {
    sanitized.ABHAProfile = { ...sanitized.ABHAProfile, profilePhoto: '***' };
  }
  return sanitized;
}

// ═══════════════════════════════════════════════════════════════
// 1. CREATE ABHA BY AADHAAR OTP
// ═══════════════════════════════════════════════════════════════

/**
 * Step 1: Request Aadhaar OTP for ABHA creation.
 * POST /v3/enrollment/request/otp
 * @param {string} aadhaarNumber - 12-digit Aadhaar number (plaintext, will be encrypted)
 * @returns {{ txnId, message }} - txnId for subsequent calls, message with masked mobile
 */
async function requestAadhaarOtp(aadhaarNumber) {
  const encryptedAadhaar = await rsaEncrypt(aadhaarNumber);

  return callAbha('post', abdmConfig.m1.requestOtp, {
    scope: ['abha-enrol'],
    loginHint: 'aadhaar',
    loginId: encryptedAadhaar,
    otpSystem: 'aadhaar',
  });
}

/**
 * Step 2: Verify Aadhaar OTP and create/retrieve ABHA.
 * POST /v3/enrollment/enrol/byAadhaar
 * @param {string} txnId - Transaction ID from step 1
 * @param {string} otpValue - 6-digit OTP (plaintext, will be encrypted)
 * @param {string} mobile - Communication mobile number
 * @returns {{ txnId, ABHAProfile, tokens, isNew, message }}
 */
async function verifyAadhaarOtp(txnId, otpValue, mobile) {
  const encryptedOtp = await rsaEncrypt(otpValue);

  return callAbha('post', abdmConfig.m1.enrolByAadhaar, {
    authData: {
      authMethods: ['otp'],
      otp: {
        txnId,
        otpValue: encryptedOtp,
        mobile,
      },
    },
    consent: {
      code: 'abha-enrollment',
      version: '1.4',
    },
  });
}

/**
 * Step 3 (optional): Request OTP to verify communication mobile.
 * Used when communication mobile differs from Aadhaar-linked mobile.
 * POST /v3/enrollment/request/otp
 */
async function requestMobileVerifyOtp(txnId, mobileNumber) {
  const encryptedMobile = await rsaEncrypt(mobileNumber);

  return callAbha('post', abdmConfig.m1.requestOtp, {
    txnId,
    scope: ['abha-enrol', 'mobile-verify'],
    loginHint: 'mobile',
    loginId: encryptedMobile,
    otpSystem: 'abdm',
  });
}

/**
 * Step 4 (optional): Verify communication mobile OTP.
 * POST /v3/enrollment/auth/byAbdm
 */
async function verifyMobileOtp(txnId, otpValue) {
  const encryptedOtp = await rsaEncrypt(otpValue);

  return callAbha('post', abdmConfig.m1.authByAbdm, {
    scope: ['abha-enrol', 'mobile-verify'],
    authData: {
      authMethods: ['otp'],
      otp: {
        txnId,
        otpValue: encryptedOtp,
      },
    },
  });
}

/**
 * Step 5: Get ABHA address suggestions.
 * GET /v3/enrollment/enrol/suggestion
 */
async function getAddressSuggestions(txnId) {
  return callAbha('get', abdmConfig.m1.addressSuggestion, null, {
    'TRANSACTION_ID': txnId,
  });
}

/**
 * Step 6: Create ABHA address.
 * POST /v3/enrollment/enrol/abha-address
 */
async function createAbhaAddress(txnId, abhaAddress) {
  return callAbha('post', abdmConfig.m1.createAddress, {
    txnId,
    abhaAddress,
    preferred: 1,
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. LOGIN WITH ABHA NUMBER
// ═══════════════════════════════════════════════════════════════

/**
 * Request OTP for login by ABHA number.
 * POST /v3/profile/login/request/otp
 * @param {string} abhaNumber - 14-digit ABHA number with dashes (XX-XXXX-XXXX-XXXX)
 * @param {string} authMethod - 'otp' (aadhaar OTP) or 'mobile' (mobile OTP)
 */
async function loginRequestOtp(loginId, loginHint, authMethod = 'abdm') {
  // PHR flow: ABHA address uses a separate endpoint and scope
  if (loginHint === 'abha-address') {
    const encryptedId = await rsaEncrypt(loginId);
    return callAbha('post', abdmConfig.m1.phrLoginRequestOtp, {
      scope: ['abha-address-login', 'mobile-verify'],
      loginHint: 'abha-address',
      loginId: encryptedId,
      otpSystem: 'abdm',
    });
  }

  // Profile flow: ABHA number, Aadhaar, mobile
  // ABDM stores ABHA numbers as XX-XXXX-XXXX-XXXX; the encrypted plaintext must match.
  let idToEncrypt = loginId;
  if (loginHint === 'abha-number') {
    const digits = loginId.replace(/\D/g, '');
    if (digits.length === 14) {
      idToEncrypt = `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;
    }
  }
  const encryptedId = await rsaEncrypt(idToEncrypt);
  const otpSystem = authMethod === 'aadhaar' ? 'aadhaar' : 'abdm';

  return callAbha('post', abdmConfig.m1.loginRequestOtp, {
    scope: ['abha-login', otpSystem === 'aadhaar' ? 'aadhaar-verify' : 'mobile-verify'],
    loginHint, // 'abha-number', 'aadhaar', 'mobile'
    loginId: encryptedId,
    otpSystem,
  });
}

/**
 * Verify login OTP.
 * Profile flow  → POST /v3/profile/login/verify
 *   Returns { txnId, authResult, accounts[], message }
 * PHR flow (abha-address) → POST /v3/phr/web/login/abha/verify
 *   Returns { txnId, authResult, users[{ abhaAddress, abhaNumber, fullName }], tokens }
 */
async function loginVerifyOtp(txnId, otpValue, authMethod = 'abdm', loginHint = '') {
  const encryptedOtp = await rsaEncrypt(otpValue);

  // PHR flow: ABHA address
  if (loginHint === 'abha-address') {
    return callAbha('post', abdmConfig.m1.phrLoginVerify, {
      scope: ['abha-address-login', 'mobile-verify'],
      authData: {
        authMethods: ['otp'],
        otp: {
          txnId,
          otpValue: encryptedOtp,
        },
      },
    });
  }

  // Profile flow: ABHA number, Aadhaar, mobile
  return callAbha('post', abdmConfig.m1.loginVerify, {
    scope: ['abha-login', authMethod === 'aadhaar' ? 'aadhaar-verify' : 'mobile-verify'],
    authData: {
      authMethods: ['otp'],
      otp: {
        txnId,
        otpValue: encryptedOtp,
      },
    },
  });
}

/**
 * Verify user - exchange short-lived T-token for long-lived X-token.
 * POST /v3/profile/login/verify/user
 * Required header: T-token (the token returned by loginVerify, expiresIn ~300s).
 * Response: { token (X-token), refreshToken, expiresIn, refreshExpiresIn }
 * @param {string} txnId
 * @param {string} abhaNumber - Selected account's ABHA number (with or without dashes)
 * @param {string} tToken - Short-lived T-token from loginVerify
 */
async function loginVerifyUser(txnId, abhaNumber, tToken) {
  // ABDM verifyUser requires ABHANumber in dashed format XX-XXXX-XXXX-XXXX (plain, not encrypted).
  // loginVerify accounts already return it that way; normalise in case digits were stripped.
  const digits = String(abhaNumber).replace(/\D/g, '');
  const formatted = digits.length === 14
    ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`
    : abhaNumber;
  const extraHeaders = tToken ? { 'T-token': `Bearer ${tToken}` } : {};

  return callAbha('post', abdmConfig.m1.verifyUser, {
    txnId,
    ABHANumber: formatted,
  }, extraHeaders);
}

// ═══════════════════════════════════════════════════════════════
// 3. FIND FORGOTTEN ABHA BY MOBILE
// ═══════════════════════════════════════════════════════════════

/**
 * Search ABHA accounts by mobile number.
 * Uses the login flow with loginHint='mobile'.
 */
async function findByMobile(mobileNumber) {
  return loginRequestOtp(mobileNumber, 'mobile', 'mobile');
}

// ═══════════════════════════════════════════════════════════════
// 4. PROFILE & CARD (requires X-token)
// ═══════════════════════════════════════════════════════════════

/**
 * Get ABHA profile.
 * GET /v3/profile/account
 * Requires X-token from login/enrolment.
 */
async function getProfile(xToken) {
  return callAbha('get', abdmConfig.m1.profile, null, {
    'X-token': `Bearer ${xToken}`,
  });
}

/**
 * Get ABHA card image (PNG).
 * GET /v3/profile/account/abha-card
 */
async function getAbhaCard(xToken) {
  const headers = await buildHeaders({ 'X-token': `Bearer ${xToken}` });
  const url = `${abdmConfig.abhaUrl}${abdmConfig.m1.abhaCard}`;

  try {
    const response = await axios.get(url, {
      headers,
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    return {
      contentType: response.headers['content-type'],
      data: Buffer.from(response.data).toString('base64'),
    };
  } catch (err) {
    // Normalize raw axios errors to the same shape as callAbha throws,
    // so handleAbdmError in the controller can read status + data correctly.
    const status = err.response?.status || 0;
    let errData;
    if (err.response?.data) {
      // arraybuffer error body — convert to string/JSON
      try {
        const text = Buffer.from(err.response.data).toString('utf8');
        errData = JSON.parse(text);
      } catch {
        errData = { message: err.message };
      }
    } else {
      errData = { message: err.message };
    }
    throw { status, data: errData, errorCode: errData?.code || '' };
  }
}

/**
 * Get ABHA QR code.
 * GET /v3/profile/account/qrCode
 */
async function getQrCode(xToken) {
  return callAbha('get', abdmConfig.m1.qrCode, null, {
    'X-token': `Bearer ${xToken}`,
  });
}

/**
 * Refresh user token using R-token.
 * GET /v3/profile/account/request/token
 */
async function refreshUserToken(refreshToken) {
  return callAbha('get', abdmConfig.m1.refreshToken, null, {
    'R-token': `Bearer ${refreshToken}`,
  });
}

// ═══════════════════════════════════════════════════════════════
// 5. LINK ABHA TO PATIENT (local DB operation)
// ═══════════════════════════════════════════════════════════════

/**
 * Link an ABHA account to a patient in the local database.
 * Enforces 1:1 mapping (one ABHA per patient, one patient per ABHA).
 */
async function linkAbhaToPatient(patientId, abhaNumber, abhaAddress, profileData) {
  // Check if patient already has an active ABHA linked
  const existingByPatient = await AbhaAccount.findOne({ where: { patient_id: patientId, status: 'active' } });
  if (existingByPatient) {
    throw { status: 409, data: { message: 'Patient already has an ABHA linked', abhaNumber: existingByPatient.abha_number } };
  }

  // Check if ABHA number is already actively linked to another patient
  const existingByAbha = await AbhaAccount.findOne({ where: { abha_number: abhaNumber, status: 'active' } });
  if (existingByAbha) {
    throw { status: 409, data: { message: 'This ABHA number is already linked to another patient' } };
  }

  // Reactivate an existing inactive record (previously unlinked) if present, else create new
  const previousRecord = await AbhaAccount.findOne({ where: { patient_id: patientId, abha_number: abhaNumber } });
  let abhaAccount;
  if (previousRecord) {
    await previousRecord.update({ abha_address: abhaAddress, profile_json: profileData || null, status: 'active' });
    abhaAccount = previousRecord;
  } else {
    abhaAccount = await AbhaAccount.create({
      patient_id: patientId,
      abha_number: abhaNumber,
      abha_address: abhaAddress,
      profile_json: profileData || null,
      status: 'active',
    });
  }

  return abhaAccount;
}

/**
 * Get linked ABHA account for a patient.
 */
async function getLinkedAbha(patientId) {
  return AbhaAccount.findOne({
    where: { patient_id: patientId, status: 'active' },
  });
}

/**
 * Unlink ABHA from a patient (soft delete — sets status to 'inactive').
 */
async function unlinkAbha(patientId) {
  const record = await AbhaAccount.findOne({ where: { patient_id: patientId, status: 'active' } });
  if (!record) {
    throw { status: 404, data: { message: 'No active ABHA linked to this patient' } };
  }
  await record.update({ status: 'inactive' });
  return { message: 'ABHA unlinked successfully' };
}

// ═══════════════════════════════════════════════════════════════
// 6. QR CODE PARSING (Scan and Share)
// ═══════════════════════════════════════════════════════════════

/**
 * Parse ABHA QR code data.
 * QR codes contain JSON with patient profile data.
 */
function parseAbhaQr(qrData) {
  try {
    const parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    return {
      abhaNumber: parsed.hidn || parsed.abhaNumber,
      abhaAddress: parsed.phr || parsed.abhaAddress,
      name: parsed.name,
      gender: parsed.gender,
      dob: parsed.dob,
      mobile: parsed.mobile,
      address: parsed.address,
      state: parsed.stateName || parsed.state,
      district: parsed.districtName || parsed.district,
    };
  } catch (err) {
    throw { status: 400, data: { message: 'Invalid QR code data' } };
  }
}

module.exports = {
  // ABHA Creation
  requestAadhaarOtp,
  verifyAadhaarOtp,
  requestMobileVerifyOtp,
  verifyMobileOtp,
  getAddressSuggestions,
  createAbhaAddress,
  // Login
  loginRequestOtp,
  loginVerifyOtp,
  loginVerifyUser,
  // Find by mobile
  findByMobile,
  // Profile & Card
  getProfile,
  getAbhaCard,
  getQrCode,
  refreshUserToken,
  // Local DB
  linkAbhaToPatient,
  getLinkedAbha,
  unlinkAbha,
  // QR
  parseAbhaQr,
};
