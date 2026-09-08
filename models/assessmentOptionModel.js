// models/assessmentOptionModel.js
const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const AssessmentOption = sequelizeDB1.define('AssessmentOption', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  assessmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  assessmentQuestionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  options: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  optionsValue: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  }
}, {
  tableName: 'assessmentOptions',
  timestamps: false
});

module.exports = AssessmentOption;
