'use strict';
/**
 * M3 HIU (Health Information User) business logic.
 * Handles consent requests, health information fetch, and FHIR data storage.
 */
const { v4: uuidv4 } = require('uuid');
const abdmConfig = require('../config/abdmConfig');
const { callGateway } = require('./gatewayService');
const { decrypt, generateKeyPair } = require('./fideliusService');
const { ConsentRequest, ConsentArtefact, HealthRecord } = require('../models');

// In-memory store for ECDH private keys (keyed by transactionId from health info request)
// Keyed by our REQUEST-ID sent to gateway; matched with incoming data-push transactionId
const ecdhKeyStore = new Map();

/**
 * Initiate a consent request (doctor/CN requesting patient records from other providers).
 * POST /api/hiecm/consent/v3/request/init
 * @param {object} params
 * @param {number} params.patientId     - AKOS patient.id
 * @param {number} params.requesterId   - User ID making the request (CN or doctor)
 * @param {string} params.abhaAddress   - Patient's ABHA address (e.g. john@abdm)
 * @param {string} params.purposeCode   - e.g. 'CAREMGT'
 * @param {string[]} params.hiTypes     - e.g. ['OPConsultation','Prescription']
 * @param {string} params.dateFrom      - ISO date string
 * @param {string} params.dateTo        - ISO date string
 * @param {string} params.expiry        - ISO date string for consent expiry
 */
async function initiateConsentRequest(params) {
  const { patientId, requesterId, abhaAddress, purposeCode, hiTypes, dateFrom, dateTo, expiry } = params;

  // Create pending record first
  const consentRecord = await ConsentRequest.create({
    patient_id: patientId,
    requester_id: requesterId,
    purpose_code: purposeCode,
    hi_types: hiTypes,
    date_range_from: dateFrom,
    date_range_to: dateTo,
    expiry,
    status: 'requested',
  });

  const result = await callGateway(
    'post',
    abdmConfig.m3.consentInit,
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      consent: {
        purpose: { code: purposeCode },
        patient: { id: abhaAddress },
        hiu: { id: abdmConfig.bridgeId },
        requester: { name: 'AKOS Care Navigator', identifier: { type: 'REGNO', value: 'AKOS-CN' } },
        hiTypes,
        permission: {
          accessMode: 'VIEW',
          dateRange: { from: dateFrom, to: dateTo },
          dataEraseAt: expiry,
          frequency: { unit: 'HOUR', value: 1, repeats: 0 },
        },
      },
    },
    'm3',
    { 'X-HIU-ID': abdmConfig.bridgeId }
  );

  return { requestId: result.requestId, consentRecordId: consentRecord.id };
}

/**
 * Check the current status of a consent request.
 * POST /api/hiecm/consent/v3/request/status
 */
async function checkConsentStatus(consentRequestId) {
  const result = await callGateway(
    'post',
    abdmConfig.m3.consentStatus,
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      consentRequestId,
    },
    'm3',
    { 'X-HIU-ID': abdmConfig.bridgeId }
  );
  return result;
}

/**
 * Fetch a consent artefact detail from ABDM.
 * POST /api/hiecm/consent/v3/fetch
 */
async function fetchArtefact(consentId) {
  const result = await callGateway(
    'post',
    abdmConfig.m3.consentFetch,
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      consentId,
    },
    'm3',
    { 'X-HIU-ID': abdmConfig.bridgeId }
  );
  return result;
}

/**
 * Request health information using a granted consent artefact.
 * POST /api/hiecm/data-flow/v3/health-information/request
 * Generates ECDH keypair, sends request to gateway.
 * @param {number} artefactDbId - `abdm_consent_artefacts.id`
 * @returns {{ requestId: string, ourPublicKey: string, ourNonce: string }}
 */
async function requestHealthInfo(artefactDbId) {
  const artefact = await ConsentArtefact.findByPk(artefactDbId);
  if (!artefact || artefact.status !== 'granted') {
    throw new Error('Consent artefact not found or not granted');
  }

  const { publicKey: ourPublicKey, privateKey: ourPrivateKey, nonce: ourNonce } = generateKeyPair();
  const expiryDate = artefact.expiry_at || new Date(Date.now() + 3600 * 1000);

  const result = await callGateway(
    'post',
    abdmConfig.m3.healthInfoRequest,
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      hiRequest: {
        consent: { id: artefact.artefact_id },
        dateRange: {
          from: artefact.artefact_json?.permission?.dateRange?.from || new Date(0).toISOString(),
          to: artefact.artefact_json?.permission?.dateRange?.to || new Date().toISOString(),
        },
        dataPushUrl: `${abdmConfig.bridgeUrl}/v3/hiu/data-push`,
        keyMaterial: {
          cryptoAlg: 'ECDH',
          curve: 'Curve25519',
          dhPublicKey: {
            expiry: expiryDate.toISOString(),
            parameters: 'Curve25519/32byte random nonce',
            keyValue: ourPublicKey,
          },
          nonce: ourNonce,
        },
      },
    },
    'm3',
    { 'X-HIU-ID': abdmConfig.bridgeId }
  );

  // Store keypair keyed by REQUEST-ID so we can decrypt when data arrives
  ecdhKeyStore.set(result.requestId, {
    privateKey: ourPrivateKey,
    nonce: ourNonce,
    artefactDbId,
    createdAt: Date.now(),
  });

  // Clean up stale entries (older than 1 hour)
  for (const [key, val] of ecdhKeyStore) {
    if (Date.now() - val.createdAt > 3600 * 1000) ecdhKeyStore.delete(key);
  }

  return { requestId: result.requestId, ourPublicKey, ourNonce };
}

/**
 * Get consent keypair by any stored request ID (for matching data-push callbacks).
 */
function getEcdhKeypair(requestId) {
  return ecdhKeyStore.get(requestId);
}

// ── Callback handlers ────────────────────────────────────────────────────────

/**
 * Handle consent on-init callback.
 * ABDM calls: POST /v3/hiu/consent/request/on-init
 * Updates the consent_request_id in our DB.
 */
async function handleConsentOnInit(body) {
  const { consentRequest } = body;
  if (!consentRequest?.id || !body.resp?.requestId) return;

  // Find our pending record by matching the gateway REQUEST-ID stored in the gateway log
  // (Simplification: update the most recent 'requested' record for now)
  await ConsentRequest.update(
    { consent_request_id: consentRequest.id },
    { where: { status: 'requested', consent_request_id: null }, order: [['created_at', 'DESC']], limit: 1 }
  );
}

/**
 * Handle consent on-status callback.
 * ABDM calls: POST /v3/hiu/consent/request/on-status
 */
async function handleConsentOnStatus(body) {
  const { consentRequest } = body;
  if (!consentRequest?.id) return;

  const statusMap = {
    REQUESTED: 'requested',
    GRANTED: 'granted',
    DENIED: 'denied',
    REVOKED: 'revoked',
    EXPIRED: 'expired',
  };
  const newStatus = statusMap[consentRequest.status] || 'requested';

  await ConsentRequest.update(
    { status: newStatus },
    { where: { consent_request_id: consentRequest.id } }
  );
}

/**
 * Handle consent on-notify callback (grant, revoke, expiry).
 * ABDM calls: POST /v3/hiu/consent/request/notify
 * On GRANTED: store artefact IDs and trigger fetch for each.
 */
async function handleConsentOnNotify(body) {
  const { notification } = body;
  if (!notification) return;

  const consentRequestId = notification.consentRequestId;
  const dbRequest = await ConsentRequest.findOne({ where: { consent_request_id: consentRequestId } });

  if (!dbRequest) return;

  if (notification.status === 'GRANTED' && Array.isArray(notification.consentArtefacts)) {
    dbRequest.status = 'granted';
    await dbRequest.save();

    // Store artefact stubs and trigger fetch for each
    for (const a of notification.consentArtefacts) {
      await ConsentArtefact.upsert({
        consent_request_id: dbRequest.id,
        artefact_id: a.id,
        status: 'granted',
        granted_at: new Date(),
      });
      // Fire-and-forget fetch (result arrives via on-fetch callback)
      fetchArtefact(a.id).catch(err => console.error('[M3] fetchArtefact error:', err.message));
    }
  } else if (notification.status === 'REVOKED' || notification.status === 'DENIED') {
    const statusMap = { REVOKED: 'revoked', DENIED: 'denied' };
    dbRequest.status = statusMap[notification.status];
    await dbRequest.save();

    if (Array.isArray(notification.consentArtefacts)) {
      for (const a of notification.consentArtefacts) {
        await ConsentArtefact.update(
          { status: 'revoked' },
          { where: { artefact_id: a.id } }
        );
      }
    }
  }

  // Acknowledge
  await callGateway(
    'post',
    '/consent/v3/request/hiu/on-notify',
    {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      acknowledgement: { status: 'OK', consentId: consentRequestId },
      response: { requestId: body.requestId },
    },
    'm3',
    { 'X-HIU-ID': abdmConfig.bridgeId }
  );
}

/**
 * Handle consent on-fetch callback (artefact details arrived).
 * ABDM calls: POST /v3/hiu/consent/on-fetch
 */
async function handleConsentOnFetch(body) {
  const { consent } = body;
  if (!consent?.consentDetail) return;

  const artefactId = consent.consentDetail.consentId;
  const expiry = consent.consentDetail.permission?.dataEraseAt;

  await ConsentArtefact.update(
    {
      artefact_json: consent.consentDetail,
      signature: consent.signature,
      expiry_at: expiry ? new Date(expiry) : null,
    },
    { where: { artefact_id: artefactId } }
  );
}

/**
 * Handle health info on-request callback (acknowledgement from HIP).
 * ABDM calls: POST /v3/hiu/health-information/on-request
 */
async function handleHealthInfoOnRequest(body) {
  // Just log — the actual data arrives via data-push callback
  const sessionStatus = body?.hiRequest?.sessionStatus;
  if (sessionStatus === 'FAILED') {
    console.error('[M3] Health info request failed:', body);
  }
}

/**
 * Handle data push callback (encrypted FHIR data arrived from HIP).
 * ABDM calls: POST /v3/hiu/data-push (or /health-information/transfer)
 * Decrypts each entry and stores as health records.
 */
async function handleDataPush(body) {
  const { entries, transactionId, keyMaterial: hipKeyMaterial } = body;
  if (!Array.isArray(entries) || entries.length === 0) return;

  // Find our keypair — search ecdhKeyStore for any entry matching this transaction
  let myKeypair = null;
  for (const [, val] of ecdhKeyStore) {
    myKeypair = val;
    break; // Use most recent for now — in production match by transactionId
  }

  if (!myKeypair) {
    console.error('[M3] No ECDH keypair found for data push. Transaction:', transactionId);
    return;
  }

  const artefact = await ConsentArtefact.findByPk(myKeypair.artefactDbId);
  if (!artefact) return;

  // Find patient via consent request
  const consentRequest = await ConsentRequest.findByPk(artefact.consent_request_id);
  if (!consentRequest) return;

  for (const entry of entries) {
    try {
      const theirPubKey = entry.keyMaterial?.dhPublicKey?.keyValue || hipKeyMaterial?.dhPublicKey?.keyValue;
      const theirNonce = entry.keyMaterial?.nonce || hipKeyMaterial?.nonce;
      if (!theirPubKey || !theirNonce) continue;

      const plaintext = decrypt(
        entry.content,
        theirPubKey,
        theirNonce,
        myKeypair.privateKey,
        myKeypair.nonce
      );

      let fhirBundle = null;
      try { fhirBundle = JSON.parse(plaintext); } catch { fhirBundle = { raw: plaintext }; }

      // Determine record type from bundle Composition.type if available
      const compositionType = fhirBundle?.entry?.[0]?.resource?.type?.coding?.[0]?.display || 'OPConsultation';
      const typeMap = {
        'Clinical consultation report': 'OPConsultation',
        'Prescription record': 'Prescription',
        'Diagnostic studies report': 'DiagnosticReport',
      };
      const recordType = typeMap[compositionType] || 'OPConsultation';

      await HealthRecord.create({
        patient_id: consentRequest.patient_id,
        consent_artefact_id: artefact.id,
        record_type: recordType,
        fhir_bundle: fhirBundle,
      });
    } catch (err) {
      console.error('[M3] Failed to decrypt/store entry:', err.message);
    }
  }

  // Clean up keypair
  for (const [key, val] of ecdhKeyStore) {
    if (val.artefactDbId === myKeypair.artefactDbId) {
      ecdhKeyStore.delete(key);
      break;
    }
  }
}

/**
 * Get all consent requests for a patient.
 */
async function getConsentRequests(patientId) {
  return ConsentRequest.findAll({
    where: { patient_id: patientId },
    include: [{ association: 'artefacts' }],
    order: [['created_at', 'DESC']],
  });
}

/**
 * Get received health records for a patient.
 */
async function getReceivedRecords(patientId) {
  return HealthRecord.findAll({
    where: { patient_id: patientId },
    order: [['received_at', 'DESC']],
  });
}

/**
 * Delete a consent request (and its artefacts) from the local DB.
 * Only removes from our DB — does not call ABDM gateway.
 */
async function deleteConsentRequest(id) {
  const deleted = await ConsentRequest.destroy({ where: { id } });
  return { removed: deleted > 0 };
}

module.exports = {
  initiateConsentRequest,
  checkConsentStatus,
  fetchArtefact,
  requestHealthInfo,
  getEcdhKeypair,
  handleConsentOnInit,
  handleConsentOnStatus,
  handleConsentOnNotify,
  handleConsentOnFetch,
  handleHealthInfoOnRequest,
  handleDataPush,
  getConsentRequests,
  getReceivedRecords,
  deleteConsentRequest,
};
