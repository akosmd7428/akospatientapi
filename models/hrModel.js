const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
class Hr extends Model {}
Hr.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    phone: {
        type: DataTypes.STRING(20)
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    gender: {
        type: DataTypes.ENUM('male', 'female', 'other')
    },
    age: {
        type: DataTypes.INTEGER
    },
    dateofbirth: {
        type: DataTypes.DATE
    },
    city: {
        type: DataTypes.STRING
    },
    state: {
        type: DataTypes.STRING
    },
    zip_code: {
        type: DataTypes.STRING(10)
    },   
    profilePic: {
        type: DataTypes.STRING
    },
    careId: {
        type: DataTypes.INTEGER
    },
    companyId: {
        type: DataTypes.INTEGER
    },
    totalAssignedPatient: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    isDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    sequelize: sequelizeDB1,
    tableName: 'hr',
    timestamps: true
});

module.exports = Hr;
