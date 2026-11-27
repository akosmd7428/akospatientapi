const AbhaAccount = require('./abhaAccount');
const CareContext = require('./careContext');
const ConsentRequest = require('./consentRequest');
const ConsentArtefact = require('./consentArtefact');
const GatewayLog = require('./gatewayLog');
const HpidAccount = require('./hpidAccount');
const HealthRecord = require('./healthRecord');
const Patient = require('../../models/patientModel');

// Associations
AbhaAccount.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });
Patient.hasOne(AbhaAccount, { foreignKey: 'patient_id', as: 'abhaAccount' });

CareContext.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });
CareContext.belongsTo(AbhaAccount, { foreignKey: 'abha_account_id', as: 'abhaAccount' });
AbhaAccount.hasMany(CareContext, { foreignKey: 'abha_account_id', as: 'careContexts' });

ConsentRequest.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });
ConsentArtefact.belongsTo(ConsentRequest, { foreignKey: 'consent_request_id', as: 'consentRequest' });
ConsentRequest.hasMany(ConsentArtefact, { foreignKey: 'consent_request_id', as: 'artefacts' });

ConsentArtefact.hasMany(HealthRecord, { foreignKey: 'consent_artefact_id', as: 'healthRecords' });
HealthRecord.belongsTo(ConsentArtefact, { foreignKey: 'consent_artefact_id', as: 'consentArtefact' });
HealthRecord.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });

module.exports = {
  AbhaAccount,
  CareContext,
  ConsentRequest,
  ConsentArtefact,
  GatewayLog,
  HpidAccount,
  HealthRecord,
};
