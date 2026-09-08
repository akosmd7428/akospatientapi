const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class LabTestPrescription extends Model {}

LabTestPrescription.init({
    prescriptionFile: DataTypes.STRING,
    notes: DataTypes.TEXT,
    patientId: DataTypes.INTEGER,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { 
    sequelize: sequelizeDB1, 
    tableName: 'labTestPrescription', 
    timestamps: true 
});

module.exports = LabTestPrescription;
