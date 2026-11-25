const { sequelizeDB1 } = require('../../config/sequelize');
const { DataTypes } = require('sequelize');

const AbhaAccount = sequelizeDB1.define('abdm_abha_account', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  patient_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
  },
  abha_number: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
  },
  abha_address: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  link_token: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  link_token_expiry: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  profile_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
  },
}, {
  tableName: 'abdm_abha_accounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = AbhaAccount;
