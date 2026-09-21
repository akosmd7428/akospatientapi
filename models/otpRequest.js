const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

/**
 * SEC-021: OTPs lived in a module-level Map. That failed across instances,
 * was lost on restart, grew without bound, and was never deleted on successful
 * verification so it stayed replayable for its full window.
 *
 * SEC-018: only the hash of the OTP is stored.
 */
const OtpRequest = sequelizeDB1.define('otpRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    otpHash: { type: DataTypes.STRING(64), allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
}, {
    tableName: 'otp_requests',
    timestamps: true,
    indexes: [
        { fields: ['email'] },
        { fields: ['expiresAt'] },
    ],
});

module.exports = OtpRequest;
