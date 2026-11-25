const m1Service = require('../services/m1Service');
const CommonHelper = require('../../helpers/commonHelper');

// ═══════════════════════════════════════════════════════════════
// ABHA CREATION BY AADHAAR OTP
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/abdm/m1/aadhaar/otp/init
 * Start ABHA creation - request Aadhaar OTP
 */
async function aadhaarOtpInit(req, res) {
  try {
    const { aadhaarNumber } = req.body;
    if (!aadhaarNumber || !/^\d{12}$/.test(aadhaarNumber)) {
      return CommonHelper.sendError(res, 400, 'Aadhaar Number is not valid');
    }

    const result = await m1Service.requestAadhaarOtp(aadhaarNumber);
    CommonHelper.sendSuccess(res, result.data, 200, 'OTP sent successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * POST /api/abdm/m1/aadhaar/otp/verify
 * Verify Aadhaar OTP and create ABHA
 */
async function aadhaarOtpVerify(req, res) {
  try {
    const { txnId, otpValue, mobile } = req.body;
    if (!txnId || !otpValue || !/^\d{6}$/.test(otpValue)) {
      return CommonHelper.sendError(res, 400, 'Invalid transaction ID or OTP');
    }

    const result = await m1Service.verifyAadhaarOtp(txnId, otpValue, mobile);
    CommonHelper.sendSuccess(res, result.data, 200, 'OTP verified successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * POST /api/abdm/m1/mobile/otp/init
 * Request OTP to verify communication mobile (when different from Aadhaar mobile)
 */
async function mobileOtpInit(req, res) {
  try {
    const { txnId, mobileNumber } = req.body;
    if (!txnId || !mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      return CommonHelper.sendError(res, 400, 'Invalid transaction ID or mobile number');
    }

    const result = await m1Service.requestMobileVerifyOtp(txnId, mobileNumber);
    CommonHelper.sendSuccess(res, result.data, 200, 'Mobile OTP sent successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * POST /api/abdm/m1/mobile/otp/verify
 * Verify communication mobile OTP
 */
async function mobileOtpVerify(req, res) {
  try {
    const { txnId, otpValue } = req.body;
    if (!txnId || !otpValue || !/^\d{6}$/.test(otpValue)) {
      return CommonHelper.sendError(res, 400, 'Invalid transaction ID or OTP');
    }

    const result = await m1Service.verifyMobileOtp(txnId, otpValue);
    CommonHelper.sendSuccess(res, result.data, 200, 'Mobile OTP verified successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * GET /api/abdm/m1/abha-address/suggestions
 * Get suggested ABHA addresses after creation
 */
async function getAddressSuggestions(req, res) {
  try {
    const { txnId } = req.query;
    if (!txnId) {
      return CommonHelper.sendError(res, 400, 'txnId is required');
    }

    const result = await m1Service.getAddressSuggestions(txnId);
    CommonHelper.sendSuccess(res, result.data, 200, 'Address suggestions fetched');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * POST /api/abdm/m1/abha-address/create
 * Create ABHA address
 */
async function createAbhaAddress(req, res) {
  try {
    const { txnId, abhaAddress } = req.body;
    if (!txnId || !abhaAddress) {
      return CommonHelper.sendError(res, 400, 'txnId and abhaAddress are required');
    }

    const result = await m1Service.createAbhaAddress(txnId, abhaAddress);
    CommonHelper.sendSuccess(res, result.data, 200, 'ABHA address created');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/abdm/m1/login/otp/init
 * Request OTP for login (supports ABHA number, ABHA address, Aadhaar, mobile)
 */
async function loginOtpInit(req, res) {
  try {
    const { loginId, loginHint, authMethod } = req.body;
    // loginHint: 'abha-number', 'abha-address', 'aadhaar', 'mobile'
    if (!loginId || !loginHint) {
      return CommonHelper.sendError(res, 400, 'loginId and loginHint are required');
    }

    const result = await m1Service.loginRequestOtp(loginId, loginHint, authMethod || 'otp');
    CommonHelper.sendSuccess(res, result.data, 200, 'Login OTP sent successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * POST /api/abdm/m1/login/otp/verify
 * Verify login OTP - returns account(s)
 */
async function loginOtpVerify(req, res) {
  try {
    const { txnId, otpValue, authMethod, loginHint } = req.body;
    if (!txnId || !otpValue || !/^\d{6}$/.test(otpValue)) {
      return CommonHelper.sendError(res, 400, 'Invalid transaction ID or OTP');
    }

    const result = await m1Service.loginVerifyOtp(txnId, otpValue, authMethod, loginHint);
    CommonHelper.sendSuccess(res, result.data, 200, 'Login OTP verified');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * POST /api/abdm/m1/login/verify-user
 * Select account and get user token (when multiple accounts returned)
 */
async function loginVerifyUser(req, res) {
  try {
    const { txnId, abhaNumber, tToken } = req.body;
    if (!txnId || !abhaNumber) {
      return CommonHelper.sendError(res, 400, 'txnId and abhaNumber are required');
    }

    const result = await m1Service.loginVerifyUser(txnId, abhaNumber, tToken);
    CommonHelper.sendSuccess(res, result.data, 200, 'User verified successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// PROFILE & CARD
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/abdm/m1/profile
 * Get ABHA profile using X-token
 */
async function getProfile(req, res) {
  try {
    const xToken = req.headers['x-token'] || req.query.xToken;
    if (!xToken) {
      return CommonHelper.sendError(res, 400, 'X-token is required');
    }

    const result = await m1Service.getProfile(xToken);
    CommonHelper.sendSuccess(res, result.data, 200, 'Profile fetched successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * GET /api/abdm/m1/abha-card
 * Get ABHA card image (PNG base64)
 */
async function getAbhaCard(req, res) {
  try {
    const xToken = req.headers['x-token'] || req.query.xToken;
    if (!xToken) {
      return CommonHelper.sendError(res, 400, 'X-token is required');
    }

    const result = await m1Service.getAbhaCard(xToken);
    CommonHelper.sendSuccess(res, result, 200, 'ABHA card fetched successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * GET /api/abdm/m1/qr-code
 * Get ABHA QR code
 */
async function getQrCode(req, res) {
  try {
    const xToken = req.headers['x-token'] || req.query.xToken;
    if (!xToken) {
      return CommonHelper.sendError(res, 400, 'X-token is required');
    }

    const result = await m1Service.getQrCode(xToken);
    CommonHelper.sendSuccess(res, result.data, 200, 'QR code fetched successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// LINK ABHA TO PATIENT
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/abdm/m1/link
 * Link ABHA to patient record (1:1 enforced)
 */
async function linkAbha(req, res) {
  try {
    const patientId = req.user.id;
    const { abhaNumber, abhaAddress, profile } = req.body;
    if (!abhaNumber || !abhaAddress) {
      return CommonHelper.sendError(res, 400, 'abhaNumber and abhaAddress are required');
    }

    const result = await m1Service.linkAbhaToPatient(patientId, abhaNumber, abhaAddress, profile);
    CommonHelper.sendSuccess(res, result, 201, 'ABHA linked successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * GET /api/abdm/m1/linked
 * Get linked ABHA for the logged-in patient
 */
async function getLinkedAbha(req, res) {
  try {
    const patientId = req.user.id;
    const result = await m1Service.getLinkedAbha(patientId);
    if (!result) {
      return CommonHelper.sendError(res, 404, 'No ABHA linked to this patient');
    }
    CommonHelper.sendSuccess(res, result, 200, 'Linked ABHA fetched successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

/**
 * DELETE /api/abdm/m1/link
 * Unlink ABHA from the logged-in patient (soft delete)
 */
async function unlinkAbha(req, res) {
  try {
    const patientId = req.user.id;
    const result = await m1Service.unlinkAbha(patientId);
    CommonHelper.sendSuccess(res, result, 200, 'ABHA unlinked successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// QR CODE PARSING
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/abdm/m1/qr/parse
 * Parse ABHA QR code data
 */
async function parseQr(req, res) {
  try {
    const { qrData } = req.body;
    if (!qrData) {
      return CommonHelper.sendError(res, 400, 'qrData is required');
    }

    const parsed = m1Service.parseAbhaQr(qrData);
    CommonHelper.sendSuccess(res, parsed, 200, 'QR code parsed successfully');
  } catch (err) {
    handleAbdmError(res, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════════════════════════

function handleAbdmError(res, err) {
  // ABDM errors thrown by our service have { status, data, errorCode }
  if (err.status && err.data) {
    console.error('[ABDM M1 Error]', err.status, JSON.stringify(err.data));

    // Shape 1: { message: "..." }
    let message = err.data?.message;
    // Shape 2: { error: { message: "..." } }
    if (!message) message = err.data?.error?.message;
    // Shape 3: { details: [{ message: "..." }] }
    if (!message) message = err.data?.details?.[0]?.message;
    // Shape 4: { errorMessage: "..." }
    if (!message) message = err.data?.errorMessage;
    // Shape 5 — ABDM field-level 400: { loginId: "Invalid LoginId", timestamp: "..." }
    if (!message && err.status === 400) {
      const skip = new Set(['timestamp', 'status', 'path', 'error', 'requestId', 'traceId']);
      const fieldErrors = Object.entries(err.data)
        .filter(([k, v]) => !skip.has(k) && typeof v === 'string')
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      if (fieldErrors) message = fieldErrors;
    }
    if (!message) message = `ABDM error (HTTP ${err.status})`;

    // Never forward 401 to the frontend — the axios interceptor treats any 401
    // as a main-app session expiry and logs the patient out.
    // ABDM 401 means the ABHA X-token is invalid/expired, which is a 400-class error.
    const statusToSend = err.status === 401 ? 400 : err.status;
    return CommonHelper.sendError(res, statusToSend, message);
  }
  // Unexpected errors
  console.error('[ABDM M1 Error] Unexpected:', err);
  CommonHelper.sendError(res, 500, 'Internal server error');
}

module.exports = {
  aadhaarOtpInit,
  aadhaarOtpVerify,
  mobileOtpInit,
  mobileOtpVerify,
  getAddressSuggestions,
  createAbhaAddress,
  loginOtpInit,
  loginOtpVerify,
  loginVerifyUser,
  getProfile,
  getAbhaCard,
  getQrCode,
  linkAbha,
  getLinkedAbha,
  unlinkAbha,
  parseQr,
};
