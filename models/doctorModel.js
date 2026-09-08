const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const Doctor = sequelizeDB1.define('Doctor', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
    },
    phoneNo: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    experience: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    speciality: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    star_rating: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    profilePic: {
        type: DataTypes.STRING,
        allowNull: true,
    }
}, {
    tableName: 'doctor',
    timestamps: false
});

module.exports = Doctor;
