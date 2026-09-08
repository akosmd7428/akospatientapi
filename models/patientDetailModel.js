const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const PatientDetail = sequelizeDB1.define('PatientDetail', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    age: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    height: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },
    weight: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },
    bloodgroup: {
        type: DataTypes.STRING(5),
        allowNull: true,
    },
    emergency_contact: {
        type: DataTypes.STRING(15),
        allowNull: true,
    },
    profile_image: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    aadharcard: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    abha_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    past_operation_detail: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    social_history: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    sexual_emotional_history: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    symptoms: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    vaccinations: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    consent: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    religious_belief: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    medications: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    medical_allergies: {
        type: DataTypes.JSON,
        allowNull: true,

    },
    health_problems: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
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
    tableName: 'patientDetails',
});

module.exports = PatientDetail;
