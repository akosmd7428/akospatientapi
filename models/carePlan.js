const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const CarePlan = sequelizeDB1.define('CarePlan', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    packageName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    discount: {
        type: DataTypes.DECIMAL(10, 2),
    },
    totalPaid: {
        type: DataTypes.DECIMAL(10, 2),
    },
    validFrom: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    validUpto: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    isPaid: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    isDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        onUpdate: DataTypes.NOW,
    },
}, {
    tableName: 'carePlans',
    timestamps: true,
});

module.exports = CarePlan;
