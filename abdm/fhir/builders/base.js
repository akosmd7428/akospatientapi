'use strict';
/**
 * Shared FHIR resource builders for NRCES-compliant bundles.
 * All resources follow ABDM FHIR profiles (NRCES / NHA).
 */
const { v4: uuidv4 } = require('uuid');

const AKOS_SYSTEM = 'https://akosmd.in/identifiers';
const ABHA_SYSTEM = 'https://healthid.ndhm.gov.in';
const SNOMED_SYSTEM = 'http://snomed.info/sct';
const LOINC_SYSTEM = 'http://loinc.org';
const ACT_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

/** Generate a UUID prefixed with a resource type for readability */
function makeId(prefix) {
  return `${prefix}-${uuidv4()}`;
}

/**
 * FHIR Patient resource with ABHA identifiers.
 * @param {object} patient  - patientModel row
 * @param {object} abhaAccount - abhaAccount model row (may be null)
 */
function makePatientResource(patient, abhaAccount) {
  const id = makeId('patient');

  const identifiers = [{
    type: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }],
    },
    system: AKOS_SYSTEM,
    value: String(patient.id),
  }];

  if (abhaAccount?.abha_number) {
    identifiers.push({
      type: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'AN' }],
        text: 'ABHA Number',
      },
      system: ABHA_SYSTEM,
      value: abhaAccount.abha_number,
    });
  }

  if (abhaAccount?.abha_address) {
    identifiers.push({
      type: { text: 'ABHA Address' },
      system: 'https://phr.abdm.gov.in',
      value: abhaAccount.abha_address,
    });
  }

  const name = [{ text: `${patient.first_name || ''} ${patient.last_name || ''}`.trim() }];
  const gender = ({ M: 'male', F: 'female', male: 'male', female: 'female' }[patient.gender]) || 'unknown';

  return {
    fullUrl: `Patient/${id}`,
    resource: {
      resourceType: 'Patient',
      id,
      meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient'] },
      identifier: identifiers,
      name,
      gender,
      birthDate: patient.dateofbirth || undefined,
      telecom: patient.phone ? [{ system: 'phone', value: patient.phone }] : undefined,
      address: patient.address1 ? [{ text: patient.address1, city: patient.city, state: patient.state }] : undefined,
    },
  };
}

/**
 * FHIR Practitioner resource from AKOS doctor row.
 */
function makePractitionerResource(doctor) {
  const id = makeId('practitioner');
  return {
    fullUrl: `Practitioner/${id}`,
    resource: {
      resourceType: 'Practitioner',
      id,
      meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Practitioner'] },
      name: [{ text: doctor.name }],
      telecom: doctor.phoneNo ? [{ system: 'phone', value: doctor.phoneNo }] : undefined,
      qualification: doctor.speciality ? [{
        code: {
          coding: [{ display: doctor.speciality }],
          text: doctor.speciality,
        },
      }] : undefined,
    },
  };
}

/**
 * FHIR Organization resource representing AKOS facility.
 */
function makeOrganizationResource() {
  const id = makeId('org');
  return {
    fullUrl: `Organization/${id}`,
    resource: {
      resourceType: 'Organization',
      id,
      meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Organization'] },
      name: 'AKOS MD Healthcare',
      telecom: [{ system: 'url', value: 'https://akosmd.in' }],
    },
  };
}

/**
 * FHIR Encounter resource from AKOS appointment row.
 */
function makeEncounterResource(appointment, patientRef, practitionerRef) {
  const id = makeId('encounter');
  const start = appointment ? `${appointment.date}T${appointment.time || '00:00:00'}` : new Date().toISOString();
  return {
    fullUrl: `Encounter/${id}`,
    resource: {
      resourceType: 'Encounter',
      id,
      meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Encounter'] },
      status: 'finished',
      class: { system: ACT_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' },
      subject: { reference: `Patient/${patientRef}` },
      participant: practitionerRef ? [{
        individual: { reference: `Practitioner/${practitionerRef}` },
      }] : undefined,
      period: { start },
    },
  };
}

/**
 * Build a minimal valid FHIR document Bundle shell.
 */
function makeBundleShell(compositionEntry, entries) {
  return {
    resourceType: 'Bundle',
    id: uuidv4(),
    meta: { lastUpdated: new Date().toISOString() },
    identifier: {
      system: AKOS_SYSTEM,
      value: uuidv4(),
    },
    type: 'document',
    timestamp: new Date().toISOString(),
    entry: [compositionEntry, ...entries],
  };
}

module.exports = {
  makeId,
  makePatientResource,
  makePractitionerResource,
  makeOrganizationResource,
  makeEncounterResource,
  makeBundleShell,
  AKOS_SYSTEM,
  SNOMED_SYSTEM,
  LOINC_SYSTEM,
};
