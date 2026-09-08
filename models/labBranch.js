const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class LabBranch extends Model {}

LabBranch.init({
    labId: DataTypes.INTEGER,
    labCityId: DataTypes.INTEGER,
    branchName: DataTypes.STRING,
    branchAddress: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, tableName: 'labBranches', timestamps: true });

module.exports = LabBranch;
