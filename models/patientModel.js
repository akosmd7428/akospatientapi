const { sequelizeDB1 } = require('../config/sequelize');
const { DataTypes } = require('sequelize');

const Patient = sequelizeDB1.define('patient', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  uuid: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    allowNull: false,
  },
  parent_id: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  dateofbirth: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  address1: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  zip_code: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isFirstLogin: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  isProfileCompleted: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  uniquePatientId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  companyId: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  employer_id: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  is_migrated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: "patient",
  timestamps: false,
});


module.exports = Patient;
