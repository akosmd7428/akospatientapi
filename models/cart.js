const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class Cart extends Model {}

Cart.init({
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    labId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    labBranchId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    labCityName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    subCityId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'sub_city_id'
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
    tableName: 'cart',
    timestamps: true
});

module.exports = Cart;
