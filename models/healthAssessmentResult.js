const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const HealthAssessmentResult = sequelizeDB1.define('HealthAssessmentResult', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    score: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    severity: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    assessmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        onUpdate: DataTypes.NOW,
    },
}, {
    tableName: 'healthAssessmentResult',
});

module.exports = HealthAssessmentResult;
