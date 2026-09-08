const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const Appointment = sequelizeDB1.define('Appointment', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    doctorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    time: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    isConfirmed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 1,
    },
    callId: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    approvedByCareNavigator: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
     is_paid: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
}, {
    tableName: 'appointments',
    timestamps: true,
});

module.exports = Appointment;
