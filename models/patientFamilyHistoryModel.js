const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const PatientFamilyHistory = sequelizeDB1.define('PatientFamilyHistory', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    breast_cancer: {
        type: DataTypes.STRING(10),
    },
    relation_breast_cancer: {
        type: DataTypes.STRING(50),
    },
    colon_cancer: {
        type: DataTypes.STRING(10),
    },
    relation_colon_cancer: {
        type: DataTypes.STRING(50),
    },
    prostate_cancer: {
        type: DataTypes.STRING(10),
    },
    relation_prostate_cancer: {
        type: DataTypes.STRING(50),
    },
    skin_cancer: {
        type: DataTypes.STRING(10),
    },
    relation_skin_cancer: {
        type: DataTypes.STRING(50),
    },
    ovarian_cancer: {
        type: DataTypes.STRING(10),
    },
    relation_ovarian_cancer: {
        type: DataTypes.STRING(50),
    },
    lung_cancer: {
        type: DataTypes.STRING(10),
    },
    relation_lung_cancer: {
        type: DataTypes.STRING(50),
    },
    other_cancer: {
        type: DataTypes.STRING(10),
    },
    relation_other_cancer: {
        type: DataTypes.STRING(50),
    },
    diabetes: {
        type: DataTypes.STRING(10),
    },
    relation_diabetes: {
        type: DataTypes.STRING(50),
    },
    hypertension: {
        type: DataTypes.STRING(10),
    },
    relation_hypertension: {
        type: DataTypes.STRING(50),
    },
    heart_disease: {
        type: DataTypes.STRING(10),
    },
    relation_heart_disease: {
        type: DataTypes.STRING(50),
    },
    lungs_problem: {
        type: DataTypes.STRING(10),
    },
    relation_lungs_problem: {
        type: DataTypes.STRING(50),
    },
    other_problems: {
        type: DataTypes.STRING(10),
    },
    relation_other_problems: {
        type: DataTypes.STRING(50),
    },
    alcoholism: {
        type: DataTypes.STRING(10),
    },
    relation_alcoholism: {
        type: DataTypes.STRING(50),
    },
    drug_abuse: {
        type: DataTypes.STRING(10),
    },
    relation_drug_abuse: {
        type: DataTypes.STRING(50),
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
    tableName: 'patientFamilyHistory',
});

module.exports = PatientFamilyHistory;
