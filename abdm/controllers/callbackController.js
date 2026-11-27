'use strict';
/**
 * ABDM Callback Controller
 * Handles all 12 inbound callbacks from the ABDM gateway.
 * Pattern: log body → delegate to service → respond 202.
 */
const m2Service = require('../services/m2Service');
const m3Service = require('../services/m3Service');

// ── M2 (HIP) Callbacks ───────────────────────────────────────────────────────

/**
 * POST /v3/hip/patient/discover
 * Patient discovery request (patient's PHR app wants to find care contexts at AKOS).
 */
async function hipPatientDiscover(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m2Service.handleDiscovery(req.body);
  } catch (err) {
    console.error('[Callback] hipPatientDiscover error:', err.message);
  }
}

/**
 * POST /v3/hip/link/init
 * User-initiated care context link start (patient chose contexts in PHR app).
 */
async function hipLinkInit(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m2Service.handleLinkInit(req.body);
  } catch (err) {
    console.error('[Callback] hipLinkInit error:', err.message);
  }
}

/**
 * POST /v3/hip/link/confirm
 * User-initiated care context link confirm (patient verified OTP in PHR app).
 */
async function hipLinkConfirm(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m2Service.handleLinkConfirm(req.body);
  } catch (err) {
    console.error('[Callback] hipLinkConfirm error:', err.message);
  }
}

/**
 * POST /v3/link/on-carecontext
 * Care context link result (HIP-initiated flow acknowledgement).
 */
async function onCareContext(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m2Service.handleCareContextLinked(req.body);
  } catch (err) {
    console.error('[Callback] onCareContext error:', err.message);
  }
}

/**
 * POST /v3/consent/hip/on-notify
 * Consent notification to HIP (grant, revoke, expiry).
 */
async function hipConsentNotify(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m2Service.handleConsentNotify(req.body);
  } catch (err) {
    console.error('[Callback] hipConsentNotify error:', err.message);
  }
}

/**
 * POST /v3/hip/health-information
 * Health information request (ABDM asking us to push encrypted FHIR to HIU).
 */
async function hipHealthInfoRequest(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m2Service.handleHealthInfoRequest(req.body);
  } catch (err) {
    console.error('[Callback] hipHealthInfoRequest error:', err.message);
  }
}

/**
 * POST /v3/hip/token/on-generate-token
 * Link token generated for HIP-initiated linking.
 */
async function hipOnGenerateToken(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m2Service.handleTokenGenerated(req.body);
  } catch (err) {
    console.error('[Callback] hipOnGenerateToken error:', err.message);
  }
}

// ── M3 (HIU) Callbacks ───────────────────────────────────────────────────────

/**
 * POST /v3/hiu/consent/on-init
 * Consent request accepted — ABDM returns consent request ID.
 */
async function hiuConsentOnInit(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m3Service.handleConsentOnInit(req.body);
  } catch (err) {
    console.error('[Callback] hiuConsentOnInit error:', err.message);
  }
}

/**
 * POST /v3/hiu/consent/on-status
 * Consent status update.
 */
async function hiuConsentOnStatus(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m3Service.handleConsentOnStatus(req.body);
  } catch (err) {
    console.error('[Callback] hiuConsentOnStatus error:', err.message);
  }
}

/**
 * POST /v3/hiu/consent/on-notify
 * Consent grant/revoke/expiry notification with artefact IDs.
 */
async function hiuConsentOnNotify(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m3Service.handleConsentOnNotify(req.body);
  } catch (err) {
    console.error('[Callback] hiuConsentOnNotify error:', err.message);
  }
}

/**
 * POST /v3/hiu/consent/on-fetch
 * Full consent artefact detail arrived.
 */
async function hiuConsentOnFetch(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m3Service.handleConsentOnFetch(req.body);
  } catch (err) {
    console.error('[Callback] hiuConsentOnFetch error:', err.message);
  }
}

/**
 * POST /v3/hiu/health-information
 * Health info request acknowledgement from HIP.
 */
async function hiuHealthInfoOnRequest(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m3Service.handleHealthInfoOnRequest(req.body);
  } catch (err) {
    console.error('[Callback] hiuHealthInfoOnRequest error:', err.message);
  }
}

/**
 * POST /v3/hiu/data-push
 * Encrypted FHIR records arrived from HIP.
 */
async function hiuDataPush(req, res) {
  res.status(202).json({ status: 'acknowledged' });
  try {
    await m3Service.handleDataPush(req.body);
  } catch (err) {
    console.error('[Callback] hiuDataPush error:', err.message);
  }
}

module.exports = {
  hipPatientDiscover,
  hipLinkInit,
  hipLinkConfirm,
  onCareContext,
  hipConsentNotify,
  hipHealthInfoRequest,
  hipOnGenerateToken,
  hiuConsentOnInit,
  hiuConsentOnStatus,
  hiuConsentOnNotify,
  hiuConsentOnFetch,
  hiuHealthInfoOnRequest,
  hiuDataPush,
};
