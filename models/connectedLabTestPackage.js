const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class ConnectedLabTestPackage extends Model {}

ConnectedLabTestPackage.init({
    labPackageId: DataTypes.INTEGER,
    labTestId: DataTypes.INTEGER,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, tableName: 'connectedLabTestPackage', timestamps: true });

module.exports = ConnectedLabTestPackage;
