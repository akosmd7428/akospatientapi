const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class ConnectedLabs extends Model {}

ConnectedLabs.init({
    companyId: DataTypes.INTEGER,
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
    referenceId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    labId: DataTypes.INTEGER,
    price: DataTypes.DECIMAL,
    discount: DataTypes.DECIMAL,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, tableName: 'connectedLabs', timestamps: true });

module.exports = ConnectedLabs;
