const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const PatientFolder = require('./patientFoldersModel');

const PatientFile = sequelizeDB1.define('patientFile', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    folderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: PatientFolder,
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    fileName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    fileType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    fileUrl: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    status: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    tableName: 'patientFiles',
    timestamps: false,
});

module.exports = PatientFile;
