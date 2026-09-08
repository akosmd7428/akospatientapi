const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const DoctorAvailability = sequelizeDB1.define('DoctorAvailability', {
    doctorId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    dayOfWeek: {
        type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
        allowNull: false
    },
    startTime: {
        type: DataTypes.STRING,
        allowNull: true
    },
    endTime: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    isHoliday: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    timestamps: true,
    tableName: 'doctorAvailability'
});

module.exports = DoctorAvailability;
