const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class VitalMonitoring extends Model {}

VitalMonitoring.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    patient_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    device_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    param_key_name: {
        type:  DataTypes.TEXT,
        allowNull: false,
    },
    param_key_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    param_value: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    status: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    is_manual: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        onUpdate: DataTypes.NOW,
    }
}, {
    sequelize: sequelizeDB1,
    tableName: 'vital_patient_monitoring',
    timestamps: true,
});

module.exports = VitalMonitoring;
