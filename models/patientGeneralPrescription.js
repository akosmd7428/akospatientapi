const { sequelizeDB1 } = require('../config/sequelize');
const { DataTypes } = require('sequelize');

const PatientGeneralPrescription = sequelizeDB1.define('PatientGeneralPrescription', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  age: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  height: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  weight: {
    type: DataTypes.STRING,
    allowNull: true,
  }, 
  location: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  prescriptionId : {
    type: DataTypes.STRING,
    allowNull: false,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  emailSent: {
    type: DataTypes.ENUM,
    values: ['pending','sent'],
    defaultValue: 'pending'
  }
}, {
  timestamps: true,
  tableName: 'patientGeneralPrescription',
});

module.exports = PatientGeneralPrescription;
