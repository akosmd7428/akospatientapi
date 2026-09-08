const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const Assessment = require('./assessmentModel');
const AssessmentQuestion = require('./assessmentQuestionModel');
const Patient = require('./patientModel');

const AssessmentPatientResponse = sequelizeDB1.define('AssessmentPatientResponse', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    levelName: {
        type: DataTypes.STRING,
        allowNull: true,
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
    assessmentAnswer: {
        type: DataTypes.TEXT,
        allowNull: false,
    },

}, {
    tableName: 'assessmentPatientResponse',
    timestamps: true,
});

AssessmentPatientResponse.associate = function(models) {
    AssessmentPatientResponse.belongsTo(Assessment, { foreignKey: 'assessmentId', as: 'assessment' });
    AssessmentPatientResponse.belongsTo(AssessmentQuestion, { foreignKey: 'assessmentQuestionId', as: 'question' });
    AssessmentPatientResponse.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
};

module.exports = AssessmentPatientResponse;
