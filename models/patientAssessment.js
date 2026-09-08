const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const Assessment = require('./assessmentModel');
const AssessmentQuestion = require('./assessmentQuestionModel');
const AssessmentOption = require('./assessmentOptionModel');
const Patient = require('./patientModel');

const PatientAssessment = sequelizeDB1.define('PatientAssessment', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Patient,
            key: 'id',
        },
    },
    assessmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Assessment,
            key: 'id',
        },
    },
    assessmentQuestionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: AssessmentQuestion,
            key: 'id',
        },
    },
    assessmentOptionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: AssessmentOption,
            key: 'id',
        },
    },
}, {
    tableName: 'patientAssessment',
    timestamps: false,
});

PatientAssessment.associate = function(models) {
    PatientAssessment.belongsTo(Assessment, { foreignKey: 'assessmentId', as: 'assessment' });
    PatientAssessment.belongsTo(AssessmentQuestion, { foreignKey: 'assessmentQuestionId', as: 'question' });
    PatientAssessment.belongsTo(AssessmentOption, { foreignKey: 'assessmentOptionId', as: 'option' });
    PatientAssessment.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
};

// PatientAssessment.belongsTo(Assessment, { foreignKey: 'assessmentId', as: 'assessment' });

module.exports = PatientAssessment;
