const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

/**
 * SEC-002: the reset flow had no state linking OTP verification to the password
 * change, so /change-password could be called directly. This row is that link:
 * it is created only on successful OTP verification and consumed atomically by
 * the change step.
 */
const PasswordReset = sequelizeDB1.define('passwordReset', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(191), allowNull: false },
    role: { type: DataTypes.STRING(32), allowNull: true },
    // SHA-256 of the reset token. The token itself is returned once and never stored.
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
    requestedByIp: { type: DataTypes.STRING(64), allowNull: true },
}, {
    tableName: 'password_resets',
    timestamps: true,
    indexes: [
        { fields: ['email'] },
        { fields: ['tokenHash'] },
    ],
});

module.exports = PasswordReset;
