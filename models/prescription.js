const { DataTypes } = require('sequelize');
const {sequelizeDB1} = require('../config/sequelize'); // Adjust the path to your Sequelize configuration

const Prescription = sequelizeDB1.define('Prescription', {
    prescription_json: {
        type: DataTypes.JSONB, // Use JSONB type for storing JSON data
        allowNull: true
    },
    prescriptionURL: {
        type: DataTypes.STRING,
        allowNull: true // Adjust if this field is required or optional
    },
    prescriptionId: {
        type: DataTypes.STRING, // Adjust the type as necessary (e.g., INTEGER)
        allowNull: false,
        unique: true // If prescriptionId needs to be unique
    },
    doctor_id: {
        type: DataTypes.INTEGER, // Adjust the type based on your database schema
        allowNull: true
    },
    appointmentId: {
        type: DataTypes.INTEGER, // Adjust the type based on your database schema
        allowNull: true
    }
}, {
    tableName: 'tbl_prescription',
    timestamps: false // Set to true if you have createdAt and updatedAt columns
});

module.exports = Prescription;
