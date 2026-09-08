const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class CartDetails extends Model {}

CartDetails.init({
    cartId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
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
    companyId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    labId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    labType: {
        type: DataTypes.STRING,
        allowNull: true
    },
    code: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
    sequelize: sequelizeDB1,
    tableName: 'cartDetails',
    timestamps: true
});

module.exports = CartDetails;
