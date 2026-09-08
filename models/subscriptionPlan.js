const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const SubscriptionPlan = sequelizeDB1.define('SubscriptionPlan', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    packageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    planKey: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    planValue: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    planType: {
        type: DataTypes.ENUM('1', '2', '3', '4'),
        allowNull: false,
        comment: '1 - Monthly, 2 - Quarterly, 3 - Annually, 4 - Other',
    },
    planTypeValue: {
        type: DataTypes.STRING,
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
    tableName: 'subscriptionPlans',
    timestamps: true,
});

module.exports = SubscriptionPlan;
