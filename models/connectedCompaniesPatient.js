// models/ConnectedCompaniesPatient.js
const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class ConnectedCompaniesPatient extends Model {}

ConnectedCompaniesPatient.init({
    connectionType: {
        type: DataTypes.ENUM('1', '2'),
        allowNull: false,
        comment: '1=company, 2=individual'
    },
    companyId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    patientId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    uniquePatientId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    patientEmail: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    sequelize: sequelizeDB1,
    tableName: 'connectedCompaniesPatient',
    timestamps: true
});

module.exports = ConnectedCompaniesPatient;
