'use strict';
/**
 * Prescription FHIR document bundle builder.
 * NRCES profile: PrescriptionRecord
 * SNOMED type: 440545006 "Prescription record"
 */
const {
  makeId, makePatientResource, makePractitionerResource,
  makeOrganizationResource, makeBundleShell, SNOMED_SYSTEM,
} = require('./base');

/**
 * Build a Prescription FHIR document bundle.
 * @param {object} prescription - prescription model row (with prescription_json)
 * @param {object} doctor       - doctorModel row
 * @param {object} patient      - patientModel row
 * @param {object} abhaAccount  - abhaAccount model row
 * @returns {object} FHIR Bundle JSON
 */
function buildPrescriptionBundle(prescription, doctor, patient, abhaAccount) {
  const patientEntry = makePatientResource(patient, abhaAccount);
  const practitionerEntry = makePractitionerResource(doctor);
  const orgEntry = makeOrganizationResource();

  const patientId = patientEntry.resource.id;
  const practitionerId = practitionerEntry.resource.id;

  const rxJson = prescription?.prescription_json || {};
  const medicines = rxJson.medicines || rxJson.medications || rxJson.drugs || [];

  const medicationRequests = Array.isArray(medicines) && medicines.length > 0
    ? medicines.map((med) => {
        const id = makeId('medreq');
        return {
          fullUrl: `MedicationRequest/${id}`,
          resource: {
            resourceType: 'MedicationRequest',
            id,
            status: 'active',
            intent: 'order',
            medicationCodeableConcept: {
              text: med.name || med.medicineName || med.medicine_name || 'Unknown',
            },
            subject: { reference: `Patient/${patientId}` },
            requester: { reference: `Practitioner/${practitionerId}` },
            dosageInstruction: [
              {
                text: [med.dosage, med.frequency, med.duration].filter(Boolean).join(' | ') || undefined,
                timing: med.frequency ? { code: { text: med.frequency } } : undefined,
              },
            ].filter(d => d.text || d.timing),
            note: med.instructions ? [{ text: med.instructions }] : undefined,
          },
        };
      })
    : [{
        fullUrl: `MedicationRequest/${makeId('medreq')}`,
        resource: {
          resourceType: 'MedicationRequest',
          id: makeId('medreq'),
          status: 'active',
          intent: 'order',
          medicationCodeableConcept: { text: 'As prescribed' },
          subject: { reference: `Patient/${patientId}` },
        },
      }];

  const compositionId = makeId('comp');
  const compositionEntry = {
    fullUrl: `Composition/${compositionId}`,
    resource: {
      resourceType: 'Composition',
      id: compositionId,
      meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord'] },
      status: 'final',
      type: {
        coding: [{ system: SNOMED_SYSTEM, code: '440545006', display: 'Prescription record' }],
      },
      date: new Date().toISOString(),
      author: [{ reference: `Practitioner/${practitionerId}` }],
      title: 'Prescription',
      custodian: { reference: `Organization/${orgEntry.resource.id}` },
      subject: { reference: `Patient/${patientId}` },
      section: [{
        title: 'Medications',
        code: { coding: [{ system: SNOMED_SYSTEM, code: '721912009', display: 'Medication summary document' }] },
        entry: medicationRequests.map(m => ({ reference: `MedicationRequest/${m.resource.id}` })),
      }],
    },
  };

  return makeBundleShell(compositionEntry, [
    patientEntry, practitionerEntry, orgEntry, ...medicationRequests,
  ]);
}

module.exports = { buildPrescriptionBundle };
