// models/connectAccessCode.js
const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

// one time codes a patient must verify before getting the connect-api token, only the sha256 hash of the code is stored
class ConnectAccessCode extends Model {}

ConnectAccessCode.init({
    codeHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
    },
    usedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    sequelize: sequelizeDB1,
    tableName: 'connectAccessCode',
    timestamps: true
});

module.exports = ConnectAccessCode;
