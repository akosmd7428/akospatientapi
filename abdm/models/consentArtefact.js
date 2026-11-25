const { sequelizeDB1 } = require('../../config/sequelize');
const { DataTypes } = require('sequelize');

const ConsentArtefact = sequelizeDB1.define('abdm_consent_artefact', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  consent_request_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  artefact_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  status: {
    type: DataTypes.ENUM('granted', 'revoked', 'expired'),
    defaultValue: 'granted',
  },
  artefact_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  signature: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  granted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  expiry_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'abdm_consent_artefacts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = ConsentArtefact;
