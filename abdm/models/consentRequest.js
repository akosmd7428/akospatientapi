const { sequelizeDB1 } = require('../../config/sequelize');
const { DataTypes } = require('sequelize');

const ConsentRequest = sequelizeDB1.define('abdm_consent_request', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  consent_request_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  patient_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  requester_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  purpose_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  hi_types: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  date_range_from: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  date_range_to: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  expiry: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('requested', 'granted', 'denied', 'revoked', 'expired'),
    defaultValue: 'requested',
  },
}, {
  tableName: 'abdm_consent_requests',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ConsentRequest;
