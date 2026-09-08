// models/patientFolderModel.js
const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const PatientFolder = sequelizeDB1.define('patientFolder', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    folderName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    folderType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    }
}, {
    tableName: 'patientFolders',
    timestamps: false,
});

module.exports = PatientFolder;
