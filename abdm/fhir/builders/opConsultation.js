'use strict';
/**
 * OPConsultation FHIR document bundle builder.
 * NRCES profile: OPConsultRecord
 * SNOMED type: 371530004 "Clinical consultation report"
 */
const {
  makeId, makePatientResource, makePractitionerResource,
  makeOrganizationResource, makeEncounterResource, makeBundleShell,
  SNOMED_SYSTEM, LOINC_SYSTEM, AKOS_SYSTEM,
} = require('./base');

/**
 * Build MedicationRequest resources from prescription_json.medicines array.
 * @param {object[]} medicines - e.g. [{ name, dosage, frequency, duration }]
 * @param {string} patientId - FHIR Patient resource id
 * @param {string} practitionerId - FHIR Practitioner resource id
 */
function buildMedicationRequests(medicines, patientId, practitionerId) {
  if (!Array.isArray(medicines) || medicines.length === 0) return [];
  return medicines.map((med) => {
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
        requester: practitionerId ? { reference: `Practitioner/${practitionerId}` } : undefined,
        dosageInstruction: (med.dosage || med.frequency || med.duration) ? [{
          text: [med.dosage, med.frequency, med.duration].filter(Boolean).join(' | '),
        }] : undefined,
      },
    };
  });
}

/**
 * Build Condition resources from prescription_json.diagnosis array.
 * @param {string[]} diagnoses - e.g. ["Hypertension", "Type 2 Diabetes"]
 * @param {string} patientId - FHIR Patient resource id
 */
function buildConditions(diagnoses, patientId) {
  if (!Array.isArray(diagnoses) || diagnoses.length === 0) return [];
  return diagnoses.map((diag) => {
    const id = makeId('condition');
    return {
      fullUrl: `Condition/${id}`,
      resource: {
        resourceType: 'Condition',
        id,
        clinicalStatus: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
        },
        code: { text: typeof diag === 'string' ? diag : diag.name || diag.description },
        subject: { reference: `Patient/${patientId}` },
      },
    };
  });
}

/**
 * Build an OPConsultation FHIR document bundle.
 * @param {object} appointment - appointmentModel row
 * @param {object} doctor      - doctorModel row
 * @param {object} patient     - patientModel row
 * @param {object} abhaAccount - abhaAccount model row
 * @param {object|null} prescription - prescription model row (may be null)
 * @returns {object} FHIR Bundle JSON
 */
function buildOPConsultBundle(appointment, doctor, patient, abhaAccount, prescription) {
  const patientEntry = makePatientResource(patient, abhaAccount);
  const practitionerEntry = makePractitionerResource(doctor);
  const orgEntry = makeOrganizationResource();
  const encounterEntry = makeEncounterResource(
    appointment,
    patientEntry.resource.id,
    practitionerEntry.resource.id
  );

  const patientId = patientEntry.resource.id;
  const practitionerId = practitionerEntry.resource.id;

  // Parse prescription_json if available
  const rxJson = prescription?.prescription_json || {};
  const medicines = rxJson.medicines || rxJson.medications || rxJson.drugs || [];
  const diagnoses = rxJson.diagnosis || rxJson.diagnoses || rxJson.chiefComplaint
    ? [rxJson.chiefComplaint].filter(Boolean)
    : [];

  const medicationRequests = buildMedicationRequests(medicines, patientId, practitionerId);
  const conditions = buildConditions(diagnoses, patientId);

  const compositionId = makeId('comp');
  const sections = [];

  if (conditions.length > 0) {
    sections.push({
      title: 'Chief Complaints',
      code: { coding: [{ system: LOINC_SYSTEM, code: '10154-3', display: 'Chief complaint' }] },
      entry: conditions.map(c => ({ reference: `Condition/${c.resource.id}` })),
    });
  }

  if (medicationRequests.length > 0) {
    sections.push({
      title: 'Medications',
      code: { coding: [{ system: SNOMED_SYSTEM, code: '721912009', display: 'Medication summary document' }] },
      entry: medicationRequests.map(m => ({ reference: `MedicationRequest/${m.resource.id}` })),
    });
  }

  if (sections.length === 0) {
    sections.push({
      title: 'OPD Notes',
      code: { coding: [{ system: LOINC_SYSTEM, code: '11488-4', display: 'Consult note' }] },
      text: { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">Consultation record</div>' },
    });
  }

  const compositionEntry = {
    fullUrl: `Composition/${compositionId}`,
    resource: {
      resourceType: 'Composition',
      id: compositionId,
      meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord'] },
      status: 'final',
      type: {
        coding: [{ system: SNOMED_SYSTEM, code: '371530004', display: 'Clinical consultation report' }],
      },
      date: new Date().toISOString(),
      author: [{ reference: `Practitioner/${practitionerId}` }],
      title: 'OPD Consultation Record',
      custodian: { reference: `Organization/${orgEntry.resource.id}` },
      subject: { reference: `Patient/${patientId}` },
      encounter: { reference: `Encounter/${encounterEntry.resource.id}` },
      section: sections,
    },
  };

  const supportingEntries = [
    patientEntry, practitionerEntry, orgEntry, encounterEntry,
    ...conditions, ...medicationRequests,
  ];

  return makeBundleShell(compositionEntry, supportingEntries);
}

module.exports = { buildOPConsultBundle };
