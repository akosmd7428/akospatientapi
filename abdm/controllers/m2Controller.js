'use strict';
/**
 * M2 HIP Controller
 * HTTP handlers for care context linking operations.
 */
const m2Service = require('../services/m2Service');
const CommonHelper = require('../../helpers/commonHelper');

/**
 * POST /api/abdm/m2/link/token
 * Generate a HIP-initiated link token for a patient's ABHA address.
 * Body: { abhaAddress }
 */
async function generateLinkToken(req, res) {
  try {
    const { abhaAddress } = req.body;
    if (!abhaAddress) {
      return CommonHelper.sendError(res, 400, 'abhaAddress is required');
    }

    const requestId = await m2Service.generateLinkToken(abhaAddress);
    CommonHelper.sendSuccess(res, { requestId }, 200, 'Link token request sent. Token will arrive via callback.');
  } catch (err) {
    handleM2Error(res, err);
  }
}

/**
 * POST /api/abdm/m2/link
 * Link a care context (visit/prescription/lab result) to patient's ABHA.
 * Body: { patientId, careContextRef, careContextDisplay, careContextType, sourceType, sourceId }
 */
async function linkCareContext(req, res) {
  try {
    const { patientId, careContextRef, careContextDisplay, careContextType, sourceType, sourceId } = req.body;

    if (!patientId || !careContextRef || !careContextDisplay || !careContextType || !sourceType || !sourceId) {
      return CommonHelper.sendError(res, 400, 'patientId, careContextRef, careContextDisplay, careContextType, sourceType and sourceId are required');
    }

    const result = await m2Service.linkCareContext({
      patientId,
      careContextRef,
      careContextDisplay,
      careContextType,
      sourceType,
      sourceId,
    });

    CommonHelper.sendSuccess(res, result, 201, 'Care context link request sent');
  } catch (err) {
    handleM2Error(res, err);
  }
}

/**
 * GET /api/abdm/m2/care-contexts/:patientId
 * Get all care contexts for a patient.
 */
async function getCareContexts(req, res) {
  try {
    const { patientId } = req.params;
    if (!patientId) {
      return CommonHelper.sendError(res, 400, 'patientId is required');
    }

    const contexts = await m2Service.getCareContexts(Number(patientId));
    CommonHelper.sendSuccess(res, contexts, 200, 'Care contexts fetched successfully');
  } catch (err) {
    handleM2Error(res, err);
  }
}

function handleM2Error(res, err) {
  if (err.status && err.data) {
    console.error('[ABDM M2 Error]', err.status, JSON.stringify(err.data));
    const message = err.data?.message || err.data?.error?.message || `ABDM M2 error (HTTP ${err.status})`;
    const statusToSend = err.status === 401 ? 400 : err.status;
    return CommonHelper.sendError(res, statusToSend, message);
  }
  console.error('[ABDM M2 Error] Unexpected:', err.message || err);
  CommonHelper.sendError(res, 500, err.message || 'Internal server error');
}

module.exports = { generateLinkToken, linkCareContext, getCareContexts };
