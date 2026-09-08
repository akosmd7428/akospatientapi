const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class LabCity extends Model {}

LabCity.init({
    cityName: DataTypes.STRING,
    cityAddress: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, tableName: 'labCities', timestamps: true });

module.exports = LabCity;
