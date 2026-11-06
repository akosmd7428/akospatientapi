// models/ssoDeeplinkCode.js
const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

// one time deeplink login codes created by /sso-deeplink, only the sha256 hash of the code is stored,
// the code only works for the company of the api client that created it and only opens the stored page
class SsoDeeplinkCode extends Model {}

SsoDeeplinkCode.init({
    codeHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    companyId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    redirectPath: {
        type: DataTypes.STRING(255),
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
    tableName: 'ssoDeeplinkCode',
    timestamps: true
});

module.exports = SsoDeeplinkCode;
