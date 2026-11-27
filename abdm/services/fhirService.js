'use strict';
/**
 * FHIR bundle orchestration service.
 * Queries AKOS DB tables and delegates to the appropriate FHIR builder.
 */
const { buildOPConsultBundle } = require('../fhir/builders/opConsultation');
const { buildPrescriptionBundle } = require('../fhir/builders/prescription');
const { buildDiagnosticReportBundle } = require('../fhir/builders/diagnosticReport');

// AKOS models
const Patient = require('../../models/patientModel');
const Appointment = require('../../models/appointmentModel');
const Prescription = require('../../models/prescription');
const LabOrder = require('../../models/labOrder');
const Doctor = require('../../models/doctorModel');
const { AbhaAccount } = require('../models');

/**
 * Build a FHIR bundle for a care context.
 * @param {string} careContextType - 'OPConsultation' | 'Prescription' | 'DiagnosticReport'
 * @param {number} sourceId        - FK to appointment/prescription/labOrder
 * @param {number} patientId       - AKOS patient.id
 * @returns {object|null} FHIR Bundle JSON, or null if data not found
 */
async function buildFhirBundle(careContextType, sourceId, patientId) {
  // Load common data
  const [patient, abhaAccount] = await Promise.all([
    Patient.findByPk(patientId),
    AbhaAccount.findOne({ where: { patient_id: patientId } }),
  ]);

  if (!patient) return null;

  switch (careContextType) {
    case 'OPConsultation':
      return buildOPConsultFhir(sourceId, patient, abhaAccount);
    case 'Prescription':
      return buildPrescriptionFhir(sourceId, patient, abhaAccount);
    case 'DiagnosticReport':
      return buildDiagnosticReportFhir(sourceId, patient, abhaAccount);
    default:
      return null;
  }
}

async function buildOPConsultFhir(appointmentId, patient, abhaAccount) {
  const appointment = await Appointment.findByPk(appointmentId);
  if (!appointment) return null;

  const [doctor, prescription] = await Promise.all([
    Doctor.findByPk(appointment.doctorId),
    Prescription.findOne({ where: { appointmentId } }),
  ]);

  if (!doctor) return null;
  return buildOPConsultBundle(appointment, doctor, patient, abhaAccount, prescription);
}

async function buildPrescriptionFhir(prescriptionId, patient, abhaAccount) {
  const prescription = await Prescription.findByPk(prescriptionId);
  if (!prescription) return null;

  const doctor = prescription.doctor_id ? await Doctor.findByPk(prescription.doctor_id) : null;
  if (!doctor) return null;

  return buildPrescriptionBundle(prescription, doctor, patient, abhaAccount);
}

async function buildDiagnosticReportFhir(labOrderId, patient, abhaAccount) {
  const labOrder = await LabOrder.findByPk(labOrderId);
  if (!labOrder) return null;

  return buildDiagnosticReportBundle(labOrder, patient, abhaAccount, null);
}

module.exports = { buildFhirBundle };
