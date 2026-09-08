const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class VitalMonitoringComment extends Model {}

VitalMonitoringComment.init({
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
    comment: {
        type:  DataTypes.TEXT,
        allowNull: false,
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user_type: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    status: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
    tableName: 'vital_monitoring_comment',
    timestamps: true,
});

module.exports = VitalMonitoringComment;
