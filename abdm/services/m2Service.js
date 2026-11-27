'use strict';
/**
 * M2 HIP (Health Information Provider) business logic.
 * Handles care context linking, patient discovery and health data transfer.
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const abdmConfig = require('../config/abdmConfig');
const { callGateway } = require('./gatewayService');
const { buildFhirBundle } = require('./fhirService');
const { encrypt } = require('./fideliusService');
const { AbhaAccount, CareContext } = require('../models');

// In-memory store for link tokens (keyed by patientId)
// In production, link tokens are stored in abdm_abha_accounts via callback
const pendingLinkTokenRequests = new Map();

/**
 * Generate a link token for HIP-initiated care context linking.
 * POST /api/hiecm/v3/token/generate-token
 * The result arrives via callback /v3/hip/token/on-generate-token
 * @param {string} abhaAddress - Patient's ABHA address (e.g. "john@abdm")
 * @returns {string} REQUEST-ID sent to gateway (use to match callback)
 */
async function generateLinkToken(abhaAddress) {
  const result = await callGateway(
    'post',
    abdmConfig.m2.generateToken,
    { abhaAddress },
    'm2',
    { 'X-HIP-ID': abdmConfig.hipId }
  );
  return result.requestId;
}

/**
 * Save link token received from the on-generate-token callback.
 * Updates abdm_abha_accounts.link_token for the matching patient.
 */
async function saveLinkToken(abhaAddress, linkToken) {
  const tokenExpiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months
  await AbhaAccount.update(
    { link_token: linkToken, link_token_expiry: tokenExpiry },
    { where: { abha_address: abhaAddress } }
  );
}

/**
 * Link a care context via HIP-initiated flow.
 * Creates a pending care context row and calls the gateway.
 * @param {object} params
 * @param {number} params.patientId          - AKOS patient.id
 * @param {string} params.careContextRef     - Unique reference (e.g. "AKOS-APPT-12345")
 * @param {string} params.careContextDisplay - Display name (NO clinical info)
 * @param {string} params.careContextType    - 'OPConsultation' | 'Prescription' | 'DiagnosticReport'
 * @param {string} params.sourceType         - 'appointment' | 'prescription' | 'labOrder'
 * @param {number} params.sourceId           - FK to source record
 */
async function linkCareContext(params) {
  const { patientId, careContextRef, careContextDisplay, careContextType, sourceType, sourceId } = params;

  const abhaAccount = await AbhaAccount.findOne({ where: { patient_id: patientId } });
  if (!abhaAccount) throw new Error('Patient does not have a linked ABHA account');
  if (!abhaAccount.link_token) throw new Error('Link token not generated. Call generateLinkToken first.');

  // Build FHIR bundle and store with care context
  const fhirBundle = await buildFhirBundle(careContextType, sourceId, patientId);

  // Create or update care context row
  const [careContext] = await CareContext.upsert({
    patient_id: patientId,
    abha_account_id: abhaAccount.id,
    care_context_reference: careContextRef,
    care_context_display: careContextDisplay,
    care_context_type: careContextType,
    source_type: sourceType,
    source_id: sourceId,
    link_status: 'pending',
    fhir_bundle: fhirBundle,
  });

  // Call gateway to link
  const result = await callGateway(
    'post',
    abdmConfig.m2.linkCareContext,
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      link: {
        accessToken: abhaAccount.link_token,
        careContexts: [{
          patientReference: abhaAccount.abha_address,
          careContextReference: careContextRef,
          display: careContextDisplay,
          hiType: careContextType,
        }],
      },
    },
    'm2',
    { 'X-HIP-ID': abdmConfig.hipId }
  );

  await CareContext.update(
    { link_request_id: result.requestId },
    { where: { id: careContext.id } }
  );

  return { requestId: result.requestId, careContextId: careContext.id };
}

/**
 * Get all care contexts for a patient.
 */
async function getCareContexts(patientId) {
  return CareContext.findAll({
    where: { patient_id: patientId },
    order: [['created_at', 'DESC']],
  });
}

// ── Callback handlers ────────────────────────────────────────────────────────

/**
 * Handle M2 patient discovery request (from patient's PHR app).
 * ABDM calls: POST /v3/hip/patient/care-context/discover
 * We respond by calling: POST /patient/care-context/on-discover
 */
async function handleDiscovery(body) {
  const { requestId, patient } = body;
  const abhaAddress = patient?.id; // ABHA address from discovery request

  let matchedContexts = [];
  if (abhaAddress) {
    const abhaAccount = await AbhaAccount.findOne({ where: { abha_address: abhaAddress } });
    if (abhaAccount) {
      const contexts = await CareContext.findAll({
        where: { patient_id: abhaAccount.patient_id, link_status: 'pending' },
      });
      matchedContexts = contexts.map(c => ({
        referenceNumber: c.care_context_reference,
        display: c.care_context_display,
        hiType: c.care_context_type,
      }));
    }
  }

  // Send on-discover response back to gateway
  await callGateway(
    'post',
    '/user-initiated-linking/v3/patient/care-context/on-discover',
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      transactionId: body.transactionId,
      patient: abhaAddress ? {
        referenceNumber: abhaAddress,
        display: 'Patient',
        careContexts: matchedContexts,
      } : null,
      response: { requestId },
    },
    'm2',
    { 'X-HIP-ID': abdmConfig.hipId }
  );
}

/**
 * Handle user-initiated link init (patient picked care contexts in PHR app).
 * ABDM calls: POST /v3/hip/link/care-context/init
 * We generate a link reference and OTP, respond via on-init.
 */
async function handleLinkInit(body) {
  const { requestId, transactionId, patient } = body;
  const linkRefNumber = uuidv4();

  // Store transactionId → linkRefNumber mapping for confirm step
  pendingLinkTokenRequests.set(linkRefNumber, {
    transactionId,
    patientRef: patient?.id,
    careContextRefs: patient?.careContexts?.map(c => c.referenceNumber) || [],
  });

  await callGateway(
    'post',
    '/user-initiated-linking/v3/link/care-context/on-init',
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      transactionId,
      link: {
        referenceNumber: linkRefNumber,
        authenticationType: 'DIRECT',
        meta: { communicationMedium: 'MOBILE', communicationHint: 'OTP sent to Aadhaar-linked mobile' },
      },
      response: { requestId },
    },
    'm2',
    { 'X-HIP-ID': abdmConfig.hipId }
  );
}

/**
 * Handle user-initiated link confirm (patient confirmed OTP in PHR app).
 * ABDM calls: POST /v3/hip/link/care-context/confirm
 */
async function handleLinkConfirm(body) {
  const { requestId, confirmation } = body;
  const linkRefNumber = confirmation?.linkRefNumber;
  const pending = pendingLinkTokenRequests.get(linkRefNumber);

  const careContexts = pending?.careContextRefs?.map(ref => ({
    referenceNumber: ref,
    display: ref,
    hiType: 'OPConsultation',
  })) || [];

  // Mark care contexts as linked
  if (pending?.careContextRefs) {
    await CareContext.update(
      { link_status: 'linked', linked_at: new Date() },
      { where: { care_context_reference: pending.careContextRefs } }
    );
  }

  pendingLinkTokenRequests.delete(linkRefNumber);

  await callGateway(
    'post',
    '/user-initiated-linking/v3/link/care-context/on-confirm',
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      patient: {
        referenceNumber: pending?.patientRef || 'unknown',
        display: 'Patient',
        careContexts,
      },
      response: { requestId },
    },
    'm2',
    { 'X-HIP-ID': abdmConfig.hipId }
  );
}

/**
 * Handle care context link result callback.
 * ABDM calls: POST /v3/link/on_carecontext
 */
async function handleCareContextLinked(body) {
  const { acknowledgement } = body;
  if (acknowledgement?.status === 'SUCCESS') {
    const ref = acknowledgement.careContext?.careContextReference;
    if (ref) {
      await CareContext.update(
        { link_status: 'linked', linked_at: new Date() },
        { where: { care_context_reference: ref } }
      );
    }
  }
}

/**
 * Handle consent notification from ABDM (HIP side).
 * ABDM calls: POST /consent/v3/request/hip/on-notify (via callback URL)
 * We acknowledge.
 */
async function handleConsentNotify(body) {
  const { notification } = body;
  const consentId = notification?.consentDetail?.consentId || notification?.consentId;

  // Acknowledge receipt
  await callGateway(
    'post',
    '/consent/v3/request/hip/on-notify',
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      acknowledgement: { status: 'OK', consentId },
      response: { requestId: body.requestId },
    },
    'm2'
  );
}

/**
 * Handle health information request (ABDM asking us to push data).
 * ABDM calls: POST /v3/hip/health-information/request
 * We: validate consent → build FHIR → encrypt → push to dataPushUrl → notify gateway.
 */
async function handleHealthInfoRequest(body) {
  const { hiRequest, sessionStatus } = body;
  if (!hiRequest) return;

  const { consent, dateRange, dataPushUrl, keyMaterial, transactionId } = hiRequest;
  const consentId = consent?.id;
  const theirPublicKey = keyMaterial?.dhPublicKey?.keyValue;
  const theirNonce = keyMaterial?.nonce;

  if (!theirPublicKey || !theirNonce || !dataPushUrl) return;

  // Find care contexts for this consent (by patient ABHA address from consent detail)
  // For now, fetch by transactionId if available; fall back to recent linked contexts
  const careContexts = await CareContext.findAll({ where: { link_status: 'linked' }, limit: 10 });

  const entries = [];
  for (const cc of careContexts) {
    const fhirBundle = cc.fhir_bundle || await buildFhirBundle(cc.care_context_type, cc.source_id, cc.patient_id);
    if (!fhirBundle) continue;

    const bundleStr = typeof fhirBundle === 'string' ? fhirBundle : JSON.stringify(fhirBundle);
    const { encryptedData, ourPublicKey, ourNonce } = encrypt(bundleStr, theirPublicKey, theirNonce);

    entries.push({
      care_context_reference: cc.care_context_reference,
      checksum: '',
      careContextReference: cc.care_context_reference,
      content: encryptedData,
      media: 'application/fhir+json',
      checksum_algorithm: 'MD5',
      keyMaterial: {
        cryptoAlg: 'ECDH',
        curve: 'Curve25519',
        dhPublicKey: { expiry: new Date(Date.now() + 3600000).toISOString(), keyValue: ourPublicKey },
        nonce: ourNonce,
      },
    });
  }

  // Push data to HIU
  if (entries.length > 0 && dataPushUrl) {
    try {
      await axios.post(dataPushUrl, {
        transactionId,
        entries,
        keyMaterial: entries[0]?.keyMaterial,
        pageNumber: 1,
        pageCount: 1,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });
    } catch (err) {
      console.error('[M2] Data push failed:', err.message);
    }
  }

  // Notify gateway of data flow status
  await callGateway(
    'post',
    '/data-flow/v3/health-information/notify',
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      notification: {
        consentId,
        transactionId,
        doneAt: new Date().toISOString(),
        statusNotification: {
          sessionStatus: 'TRANSFERRED',
          hipId: abdmConfig.hipId,
          statusResponses: careContexts.map(cc => ({
            careContextReference: cc.care_context_reference,
            hiStatus: 'DELIVERED',
            description: 'Success',
          })),
        },
      },
    },
    'm2'
  );
}

/**
 * Save link token received from on-generate-token callback.
 */
async function handleTokenGenerated(body) {
  const { abhaAddress, linkToken } = body?.tokenDetails || {};
  if (abhaAddress && linkToken) {
    await saveLinkToken(abhaAddress, linkToken);
  }
}

module.exports = {
  generateLinkToken,
  saveLinkToken,
  linkCareContext,
  getCareContexts,
  handleDiscovery,
  handleLinkInit,
  handleLinkConfirm,
  handleCareContextLinked,
  handleConsentNotify,
  handleHealthInfoRequest,
  handleTokenGenerated,
};
