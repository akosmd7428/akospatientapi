const { sequelizeDB1 } = require('../config/sequelize');
const { DataTypes } = require('sequelize');

const PatientPrescriptionDetails = sequelizeDB1.define('PatientPrescriptionDetails', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  previousHistory: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  diagnosis: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  labFindings: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  suggestedInvestigations: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  specialInstructions: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  chiefComplaints: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  appointmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  signature: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  doctorEmail: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  patientEmail : {
    type: DataTypes.STRING,
    allowNull: true,
  },
  prescriptionUniqueId : {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  timestamps: true,
  tableName: 'patientPrescriptionDetails',
});

module.exports = PatientPrescriptionDetails;
