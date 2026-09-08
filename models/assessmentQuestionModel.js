// models/assessmentQuestionModel.js
const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const AssessmentQuestion = sequelizeDB1.define('AssessmentQuestion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  assessmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  questions: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  paramName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  assessmentOptionType: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  isRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  level : {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  levelName : {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isDisplay : {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
}, {
  tableName: 'assessmentQuestions',
  timestamps: false
});

module.exports = AssessmentQuestion;
