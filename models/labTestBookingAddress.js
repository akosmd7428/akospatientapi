const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class LabTestBookingAddress extends Model {}

LabTestBookingAddress.init({
    patientId: DataTypes.INTEGER,
    zip_code: DataTypes.STRING,
    state: DataTypes.STRING,
    city: DataTypes.STRING,
    address: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { 
    sequelize: sequelizeDB1, 
    tableName: 'labTestBookingAddress', 
    timestamps: true 
});

module.exports = LabTestBookingAddress;
