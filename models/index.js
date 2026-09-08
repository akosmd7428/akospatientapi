// models/index.js
const { sequelizeDB1 } = require('../config/sequelize');
const Assessment = require('./assessmentModel');
const AssessmentQuestion = require('./assessmentQuestionModel');
const AssessmentOption = require('./assessmentOptionModel');

// Define associations
AssessmentQuestion.belongsTo(Assessment, {
  foreignKey: 'assessmentId',
});

AssessmentQuestion.hasMany(AssessmentOption, {
  as: 'options',
  foreignKey: 'assessmentQuestionId',
});

AssessmentOption.belongsTo(Assessment, {
  foreignKey: 'assessmentId',
});

AssessmentOption.belongsTo(AssessmentQuestion, {
  foreignKey: 'assessmentQuestionId',
});

// Export models
module.exports = {
  Assessment,
  AssessmentQuestion,
  AssessmentOption,
  sequelizeDB1
};
