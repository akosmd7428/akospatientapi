'use strict';
/**
 * M3 HIU Controller
 * HTTP handlers for consent management and health record fetch.
 */
const m3Service = require('../services/m3Service');
const CommonHelper = require('../../helpers/commonHelper');

/**
 * POST /api/abdm/m3/consent/request
 * Initiate a consent request to fetch a patient's records from other providers.
 * Body: { patientId, abhaAddress, purposeCode, hiTypes, dateFrom, dateTo, expiry }
 */
async function initiateConsentRequest(req, res) {
  try {
    const { patientId, abhaAddress, purposeCode, hiTypes, dateFrom, dateTo, expiry } = req.body;

    if (!patientId || !abhaAddress || !purposeCode || !hiTypes || !dateFrom || !dateTo || !expiry) {
      return CommonHelper.sendError(res, 400, 'patientId, abhaAddress, purposeCode, hiTypes, dateFrom, dateTo and expiry are required');
    }

    if (!Array.isArray(hiTypes) || hiTypes.length === 0) {
      return CommonHelper.sendError(res, 400, 'hiTypes must be a non-empty array');
    }

    const requesterId = req.user.id;
    const result = await m3Service.initiateConsentRequest({
      patientId,
      requesterId,
      abhaAddress,
      purposeCode,
      hiTypes,
      dateFrom,
      dateTo,
      expiry,
    });

    CommonHelper.sendSuccess(res, result, 201, 'Consent request sent to patient');
  } catch (err) {
    handleM3Error(res, err);
  }
}

/**
 * GET /api/abdm/m3/consent/:patientId
 * Get all consent requests made for a patient.
 */
async function getConsentRequests(req, res) {
  try {
    const { patientId } = req.params;
    if (!patientId) {
      return CommonHelper.sendError(res, 400, 'patientId is required');
    }

    const requests = await m3Service.getConsentRequests(Number(patientId));
    CommonHelper.sendSuccess(res, requests, 200, 'Consent requests fetched successfully');
  } catch (err) {
    handleM3Error(res, err);
  }
}

/**
 * POST /api/abdm/m3/health-info/request
 * Request health data transfer using a granted consent artefact.
 * Body: { artefactDbId }
 */
async function requestHealthInfo(req, res) {
  try {
    const { artefactDbId } = req.body;
    if (!artefactDbId) {
      return CommonHelper.sendError(res, 400, 'artefactDbId is required');
    }

    const result = await m3Service.requestHealthInfo(Number(artefactDbId));
    CommonHelper.sendSuccess(res, result, 200, 'Health info request sent. Records will arrive via data-push callback.');
  } catch (err) {
    handleM3Error(res, err);
  }
}

/**
 * GET /api/abdm/m3/records/:patientId
 * Get all received health records for a patient.
 */
async function getReceivedRecords(req, res) {
  try {
    const { patientId } = req.params;
    if (!patientId) {
      return CommonHelper.sendError(res, 400, 'patientId is required');
    }

    const records = await m3Service.getReceivedRecords(Number(patientId));
    CommonHelper.sendSuccess(res, records, 200, 'Health records fetched successfully');
  } catch (err) {
    handleM3Error(res, err);
  }
}

/**
 * DELETE /api/abdm/m3/consent/:id
 * Remove a consent request from the local DB.
 */
async function deleteConsentRequest(req, res) {
  try {
    const { id } = req.params;
    if (!id) return CommonHelper.sendError(res, 400, 'id is required');

    const result = await m3Service.deleteConsentRequest(Number(id));
    if (!result.removed) return CommonHelper.sendError(res, 404, 'Consent request not found');

    CommonHelper.sendSuccess(res, null, 200, 'Consent request removed');
  } catch (err) {
    handleM3Error(res, err);
  }
}

function handleM3Error(res, err) {
  if (err.status && err.data) {
    console.error('[ABDM M3 Error]', err.status, JSON.stringify(err.data));
    const message = err.data?.message || err.data?.error?.message || `ABDM M3 error (HTTP ${err.status})`;
    const statusToSend = err.status === 401 ? 400 : err.status;
    return CommonHelper.sendError(res, statusToSend, message);
  }
  console.error('[ABDM M3 Error] Unexpected:', err.message || err);
  CommonHelper.sendError(res, 500, err.message || 'Internal server error');
}

module.exports = { initiateConsentRequest, getConsentRequests, requestHealthInfo, getReceivedRecords, deleteConsentRequest };
