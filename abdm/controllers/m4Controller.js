const m4Service = require('../services/m4Service');
const CommonHelper = require('../../helpers/commonHelper');

// Map JWT role strings to the DB user_type enum.
function resolveUserType(role) {
  const map = { careNavigator: 'cnavigator' };
  return map[role] || null;
}

// ═══════════════════════════════════════════════════════════════
// HP-ID REGISTRATION — LINK-BASED AADHAAR FLOW (V4)
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/abdm/m4/aadhaar/link/init
 * Step 1: Generate ABDM-hosted Aadhaar auth link.
 * No body required. Returns { txnId, url } for the frontend to open.
 */
async function aadhaarLinkInit(req, res) {
  try {
    const result = await m4Service.generateAadhaarLink();
    CommonHelper.sendSuccess(res, {
      txnId: result.data?.txnId,
      url: result.data?.url,
      status: result.data?.status,
    }, 200, 'Aadhaar auth link generated');
  } catch (err) {
    handleM4Error(res, err);
  }
}

/**
 * POST /api/abdm/m4/aadhaar/link/poll
 * Step 2: Poll whether the user has completed Aadhaar auth on ABDM's page.
 * Body: { txnId }
 *
 * If authenticated:
 *   - Fetches Aadhaar demographic data (name, DOB, etc.)
 *   - Checks if HP-ID already exists for this Aadhaar
 * Returns: { authenticated, txnId, name?, isNewUser?, existingHpId? }
 */
async function aadhaarLinkPoll(req, res) {
  try {
    const { txnId } = req.body;
    if (!txnId) {
      return CommonHelper.sendError(res, 400, 'txnId is required');
    }

    const authResult = await m4Service.isAadhaarAuthenticated(txnId);
    const authenticated = authResult.data === true || authResult.data?.authenticated === true;

    if (!authenticated) {
      return CommonHelper.sendSuccess(res, { authenticated: false, txnId }, 200,
        'Aadhaar authentication not yet completed');
    }

    // Auth confirmed — fetch demographic data and check account status
    let name = null;
    let isNewUser = true;
    let existingHpId = null;
    let verifiedTxnId = txnId;

    try {
      const aadhaarData = await m4Service.getAadhaarData(txnId);
      name = aadhaarData.data?.name || null;
      verifiedTxnId = aadhaarData.data?.txnId || txnId;
    } catch (dataErr) {
      // Non-fatal — proceed without demographic data
      console.warn('[ABDM M4] getAadhaarData failed:', dataErr.data?.message || dataErr);
    }

    try {
      const existCheck = await m4Service.checkHpIdExist(verifiedTxnId);
      isNewUser = existCheck.data?.new !== false; // default to new if field absent
      if (!isNewUser) {
        existingHpId = existCheck.data?.hprId || null;
      }
    } catch (checkErr) {
      // Non-fatal — assume new user if check fails
      console.warn('[ABDM M4] checkHpIdExist failed:', checkErr.data?.message || checkErr);
    }

    return CommonHelper.sendSuccess(res, {
      authenticated: true,
      txnId: verifiedTxnId,
      name,
      isNewUser,
      existingHpId,
    }, 200, 'Aadhaar authentication confirmed');
  } catch (err) {
    handleM4Error(res, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// HP-ID ADDRESS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/abdm/m4/hpid/suggestions?txnId=...
 * Get HP-ID address suggestions after Aadhaar auth.
 */
async function hpidSuggestions(req, res) {
  try {
    const { txnId } = req.query;
    if (!txnId) {
      return CommonHelper.sendError(res, 400, 'txnId is required');
    }

    const result = await m4Service.getHpidSuggestions(txnId);
    CommonHelper.sendSuccess(res, result.data, 200, 'HP-ID suggestions fetched');
  } catch (err) {
    handleM4Error(res, err);
  }
}

/**
 * POST /api/abdm/m4/hpid/create
 * Create HP-ID with selected address.
 * Body: { txnId, hprId, email, firstName?, lastName?, password? }
 */
async function createHpid(req, res) {
  try {
    const { txnId, hprId, email, firstName, lastName, password } = req.body;
    if (!txnId || !hprId) {
      return CommonHelper.sendError(res, 400, 'txnId and hprId are required');
    }
    if (!email) {
      return CommonHelper.sendError(res, 400, 'email is required for HP-ID creation');
    }

    const result = await m4Service.createHpid(txnId, hprId, email, firstName, lastName, password);
    CommonHelper.sendSuccess(res, result.data, 200, 'HP-ID created successfully');
  } catch (err) {
    handleM4Error(res, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// HP-ID PROFILE
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/abdm/m4/profile
 * Fetch HP-ID profile using HPR user token from X-Token header.
 */
async function getProfile(req, res) {
  try {
    const userToken = req.headers['x-token'];
    if (!userToken) {
      return CommonHelper.sendError(res, 400, 'X-Token header is required');
    }

    const result = await m4Service.getHpidProfile(userToken);
    CommonHelper.sendSuccess(res, result.data, 200, 'HP-ID profile fetched');
  } catch (err) {
    handleM4Error(res, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// LINK / GET HP-ID
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/abdm/m4/link
 * Link HP-ID to the logged-in portal user's account.
 * Body: { hprId, hprToken? }
 */
async function linkHpid(req, res) {
  try {
    const userId = req.user.id;
    const userType = resolveUserType(req.user.role);
    if (!userType) {
      return CommonHelper.sendError(res, 403, 'HP-ID linking is not supported for this role');
    }

    const { hprId, hprToken } = req.body;
    if (!hprId) {
      return CommonHelper.sendError(res, 400, 'hprId is required');
    }

    const result = await m4Service.linkHpid(userId, userType, hprId, hprToken);
    CommonHelper.sendSuccess(res, result, 201, 'HP-ID linked successfully');
  } catch (err) {
    handleM4Error(res, err);
  }
}

/**
 * DELETE /api/abdm/m4/linked
 * Unlink HP-ID from the logged-in portal user's account.
 */
async function unlinkHpid(req, res) {
  try {
    const userId = req.user.id;
    const userType = resolveUserType(req.user.role);
    if (!userType) {
      return CommonHelper.sendError(res, 403, 'HP-ID is not supported for this role');
    }

    const result = await m4Service.unlinkHpid(userId, userType);
    if (!result.removed) {
      return CommonHelper.sendError(res, 404, 'No HP-ID linked to this account');
    }
    CommonHelper.sendSuccess(res, null, 200, 'HP-ID unlinked successfully');
  } catch (err) {
    handleM4Error(res, err);
  }
}

/**
 * GET /api/abdm/m4/linked
 * Get linked HP-ID for the logged-in portal user.
 */
async function getLinkedHpid(req, res) {
  try {
    const userId = req.user.id;
    const userType = resolveUserType(req.user.role);
    if (!userType) {
      return CommonHelper.sendError(res, 403, 'HP-ID is not supported for this role');
    }

    const result = await m4Service.getLinkedHpid(userId, userType);
    // Return 200 with null when no HP-ID linked yet — user exists but hasn't set up HP-ID.
    CommonHelper.sendSuccess(res, result || null, 200,
      result ? 'Linked HP-ID fetched successfully' : 'No HP-ID linked yet');
  } catch (err) {
    handleM4Error(res, err);
  }
}

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════════════════════════

function handleM4Error(res, err) {
  // Network-level errors: ETIMEDOUT, ECONNREFUSED, ENOTFOUND — status is 0 (falsy)
  if (!err.status) {
    const netMsg = err.data?.message || '';
    console.error('[ABDM M4 Error] Network:', netMsg);
    if (netMsg.includes('ETIMEDOUT') || netMsg.includes('ECONNREFUSED')) {
      return CommonHelper.sendError(res, 503,
        'Cannot reach ABDM NHPR server (apihspsbx.abdm.gov.in). Check that your server has outbound internet access and your ABDM credentials are registered on the sandbox.');
    }
    if (netMsg.includes('ENOTFOUND')) {
      return CommonHelper.sendError(res, 503,
        'ABDM NHPR hostname could not be resolved. Check your DNS or ABDM_HPR_URL setting.');
    }
    return CommonHelper.sendError(res, 503, `ABDM NHPR unreachable: ${netMsg || 'unknown network error'}`);
  }

  // HTTP error responses from ABDM
  console.error('[ABDM M4 Error]', err.status, JSON.stringify(err.data));

  // Check inner detail code for more specific error (HIS-403 = client not authorised for NHPR)
  const innerCode = err.data?.details?.[0]?.code || '';
  if (innerCode === 'HIS-403' || err.data?.details?.some(d => d.message?.toLowerCase().includes('not allowed'))) {
    return CommonHelper.sendError(res, 403,
      'Your sandbox client does not have access to the HPR (NHPR) API. ' +
      'Go to sandbox.abdm.gov.in → your application → subscribe to the HPR/NHPR product.');
  }

  let message = err.data?.message
    || err.data?.error?.message
    || err.data?.details?.[0]?.message
    || err.data?.errorMessage;

  if (!message) message = `ABDM HP-ID error (HTTP ${err.status})`;

  // Map 401 → 400 to avoid frontend session-expiry logout
  const statusToSend = err.status === 401 ? 400 : err.status;
  return CommonHelper.sendError(res, statusToSend, message);
}

module.exports = {
  aadhaarLinkInit,
  aadhaarLinkPoll,
  hpidSuggestions,
  createHpid,
  getProfile,
  linkHpid,
  getLinkedHpid,
  unlinkHpid,
};
