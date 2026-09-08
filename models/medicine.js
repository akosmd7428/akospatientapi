// models/medicine.js
const { sequelizeDB1 } = require('../config/sequelize');
const { DataTypes } = require('sequelize');

const Medicine = sequelizeDB1.define('Medicine', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    medicineName: {
        type: DataTypes.STRING(255),
        allowNull: false,
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
    }
}, {
    timestamps: true,
    tableName: 'medicines',
});

module.exports = Medicine;
