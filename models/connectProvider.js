const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const Doctor = require('./doctorModel');

const ConnectProvider = sequelizeDB1.define('ConnectProvider', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
    },
    employer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    profilePic: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    doctor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Doctor',
            key: 'id'
        }
    }
}, {
    tableName: 'connect_provider',
    timestamps: false
});

ConnectProvider.associate = function(models) {
    ConnectProvider.belongsTo(Doctor, { foreignKey: 'doctor_id', as: 'doctor' });
};

module.exports = ConnectProvider;
