const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class Chat extends Model {}

Chat.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    roomId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    senderId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    senderType: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '1=Patient, 2=Doctor,3-CareNavigator'
    },
    receiverId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    receiverType: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '1=Patient, 2=Doctor,3-CareNavigator'
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    messageType: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '1=text, 2=file'
    },
    isRead: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    }
}, {
    sequelize: sequelizeDB1,
    tableName: 'chats',
    timestamps: true,
});

module.exports = Chat;
