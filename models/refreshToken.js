const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

/**
 * SEC-017: makes sessions revocable. Access tokens are short-lived (15 min);
 * this row is the durable half, so logout, password change and reuse detection
 * can actually terminate a session.
 */
const RefreshToken = sequelizeDB1.define('refreshToken', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    role: { type: DataTypes.STRING(32), allowNull: false },
    // The token itself is never stored, only its SHA-256.
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    // Ties the refresh token to the access token issued beside it.
    jti: { type: DataTypes.STRING(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    createdByIp: { type: DataTypes.STRING(64), allowNull: true },
}, {
    tableName: 'refresh_tokens',
    timestamps: true,
    indexes: [
        { fields: ['userId', 'role'] },
        { fields: ['tokenHash'] },
        { fields: ['expiresAt'] },
    ],
});

module.exports = RefreshToken;
