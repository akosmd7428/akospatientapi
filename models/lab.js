const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class Lab extends Model {}

Lab.init({
    labName: DataTypes.STRING,
    description: DataTypes.TEXT,
    labAddress: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, tableName: 'labs', timestamps: true });

module.exports = Lab;
