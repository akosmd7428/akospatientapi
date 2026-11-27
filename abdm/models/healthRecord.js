'use strict';
const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../../config/sequelize');

const HealthRecord = sequelizeDB1.define('HealthRecord', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  patient_id: { type: DataTypes.INTEGER, allowNull: false },
  consent_artefact_id: { type: DataTypes.INTEGER, allowNull: true },
  record_type: {
    type: DataTypes.ENUM(
      'OPConsultation', 'Prescription', 'DiagnosticReport',
      'DischargeSummary', 'ImmunizationRecord', 'HealthDocumentRecord',
      'WellnessRecord', 'Invoice'
    ),
    allowNull: false,
  },
  fhir_bundle: { type: DataTypes.JSON, allowNull: true },
  received_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'abdm_health_records',
  timestamps: false,
  indexes: [{ fields: ['patient_id'] }],
});

module.exports = HealthRecord;
