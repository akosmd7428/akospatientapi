const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class ConnectedCompaniesLabPackage extends Model {}

ConnectedCompaniesLabPackage.init({
    companyId: DataTypes.INTEGER,
    categoryId: DataTypes.INTEGER,
    labPackageId: DataTypes.INTEGER,
    type: {
        type: DataTypes.ENUM,
        values: ['Test', 'Package'],
        comment: '1=Test, 2=Package',
        allowNull: false
    },
    mode: {
        type: DataTypes.ENUM,
        values: ['Pathology', 'Radiology'],
        comment: '1=Pathology, 2=Radiology',
        allowNull: false
    },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, tableName: 'connectedCompaniesLabPackage', timestamps: true });

module.exports = ConnectedCompaniesLabPackage;
