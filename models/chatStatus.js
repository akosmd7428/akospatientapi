const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class ChatStatus extends Model {}

ChatStatus.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    userType : {
        type: DataTypes.STRING,
        allowNull: false
    },
    isOnline: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    lastActive: {
        type: DataTypes.DATE,  // Use DATE type to store timestamps
        defaultValue: DataTypes.NOW,  // Defaults to the current timestamp
    },
}, {
    sequelize: sequelizeDB1,
    tableName: 'chatStatus',
    timestamps: true,
});

module.exports = ChatStatus;
