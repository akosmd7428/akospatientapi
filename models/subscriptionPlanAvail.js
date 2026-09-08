const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class SubscriptionPlanAvail extends Model {}

SubscriptionPlanAvail.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    patient_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    planKey: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    reference_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    company_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    care_plan_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    status: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        allowNull: false
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    type: {
        type: DataTypes.ENUM('package', 'test'),
        allowNull: false
    }
}, {
    sequelize: sequelizeDB1,
    tableName: 'subscription_plan_avail',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = SubscriptionPlanAvail;
