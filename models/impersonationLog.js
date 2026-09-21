const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

/**
 * SEC-012: the impersonation endpoint minted a full patient session with no
 * record that it was an impersonation. Actions taken under it were
 * indistinguishable from the patient's own, so any dispute over who entered or
 * changed clinical data was unresolvable.
 *
 * The row is written BEFORE the token is issued: if this insert fails, no token
 * is minted.
 */
const ImpersonationLog = sequelizeDB1.define('impersonationLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    actorId: { type: DataTypes.INTEGER, allowNull: false },
    actorRole: { type: DataTypes.STRING(32), allowNull: false },
    subjectId: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: false },
}, {
    tableName: 'impersonation_logs',
    timestamps: true,
    indexes: [
        { fields: ['actorId'] },
        { fields: ['subjectId'] },
    ],
});

module.exports = ImpersonationLog;
