const { sequelizeDB1 } = require('../../config/sequelize');
const { DataTypes } = require('sequelize');

const CareContext = sequelizeDB1.define('abdm_care_context', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  patient_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  abha_account_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  care_context_reference: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  care_context_display: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  care_context_type: {
    type: DataTypes.ENUM(
      'OPConsultation', 'Prescription', 'DiagnosticReport',
      'DischargeSummary', 'ImmunizationRecord', 'HealthDocumentRecord',
      'WellnessRecord', 'Invoice'
    ),
    allowNull: false,
  },
  source_type: {
    type: DataTypes.ENUM('appointment', 'labOrder', 'prescription'),
    allowNull: false,
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  linked_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  link_status: {
    type: DataTypes.ENUM('pending', 'linked', 'failed'),
    defaultValue: 'pending',
  },
  link_request_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  fhir_bundle: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'abdm_care_contexts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = CareContext;
