'use strict';
/**
 * DiagnosticReport FHIR document bundle builder.
 * NRCES profile: DiagnosticReportRecord
 * SNOMED type: 721981007 "Diagnostic studies report"
 */
const {
  makeId, makePatientResource, makePractitionerResource,
  makeOrganizationResource, makeBundleShell, SNOMED_SYSTEM, LOINC_SYSTEM,
} = require('./base');

/**
 * Build a DiagnosticReport FHIR document bundle.
 * @param {object} labOrder    - labOrder model row
 * @param {object} patient     - patientModel row
 * @param {object} abhaAccount - abhaAccount model row
 * @param {object|null} doctor - doctorModel row (may be null for lab orders without a doctor)
 * @returns {object} FHIR Bundle JSON
 */
function buildDiagnosticReportBundle(labOrder, patient, abhaAccount, doctor) {
  const patientEntry = makePatientResource(patient, abhaAccount);
  const orgEntry = makeOrganizationResource();
  const patientId = patientEntry.resource.id;

  const practitionerEntry = doctor ? makePractitionerResource(doctor) : null;
  const practitionerId = practitionerEntry?.resource.id;

  // Build the DiagnosticReport resource
  const reportId = makeId('diagreport');
  const reportDate = labOrder.bookingDate
    ? `${labOrder.bookingDate}T00:00:00Z`
    : new Date().toISOString();

  const diagnosticReportEntry = {
    fullUrl: `DiagnosticReport/${reportId}`,
    resource: {
      resourceType: 'DiagnosticReport',
      id: reportId,
      meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord'] },
      status: labOrder.orderStatus === 'Report Generated' ? 'final' : 'preliminary',
      code: {
        coding: [{ system: LOINC_SYSTEM, code: '11502-2', display: 'Laboratory report' }],
        text: 'Laboratory Report',
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: reportDate,
      issued: new Date().toISOString(),
      performer: practitionerId ? [{ reference: `Practitioner/${practitionerId}` }] : undefined,
      presentedForm: labOrder.labReportURL
        ? [{
            contentType: 'application/pdf',
            url: labOrder.labReportURL,
            title: 'Lab Report',
          }]
        : undefined,
    },
  };

  const compositionId = makeId('comp');
  const compositionEntry = {
    fullUrl: `Composition/${compositionId}`,
    resource: {
      resourceType: 'Composition',
      id: compositionId,
      meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/DiagnosticReportRecord'] },
      status: 'final',
      type: {
        coding: [{ system: SNOMED_SYSTEM, code: '721981007', display: 'Diagnostic studies report' }],
      },
      date: new Date().toISOString(),
      author: practitionerId
        ? [{ reference: `Practitioner/${practitionerId}` }]
        : [{ reference: `Organization/${orgEntry.resource.id}` }],
      title: 'Diagnostic Report',
      custodian: { reference: `Organization/${orgEntry.resource.id}` },
      subject: { reference: `Patient/${patientId}` },
      section: [{
        title: 'Report',
        code: { coding: [{ system: LOINC_SYSTEM, code: '11502-2', display: 'Laboratory report' }] },
        entry: [{ reference: `DiagnosticReport/${reportId}` }],
      }],
    },
  };

  const entries = [patientEntry, orgEntry, diagnosticReportEntry];
  if (practitionerEntry) entries.splice(1, 0, practitionerEntry);

  return makeBundleShell(compositionEntry, entries);
}

module.exports = { buildDiagnosticReportBundle };
