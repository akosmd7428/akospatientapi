const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const Patient = require('./patientModel');
const Doctor = require('./doctorModel');

const PatientCareTeam = sequelizeDB1.define('patientCareTeam', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'patients',
            key: 'id'
        }
    },
    doctorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'doctors',
            key: 'id'
        }
    }
}, {
    tableName: 'patientCareTeam',
    timestamps: false
});

PatientCareTeam.associate = function(models) {
    PatientCareTeam.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
    PatientCareTeam.belongsTo(Doctor, { foreignKey: 'doctorId', as: 'doctor' });
};

module.exports = PatientCareTeam;
