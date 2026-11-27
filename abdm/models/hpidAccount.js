const { sequelizeDB1 } = require('../../config/sequelize');
const { DataTypes } = require('sequelize');

const HpidAccount = sequelizeDB1.define('abdm_hpid_account', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  user_type: {
    type: DataTypes.ENUM('doctor', 'cnavigator', 'ohcstaff'),
    allowNull: false,
  },
  hpr_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  hpr_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  linked_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'abdm_hpid_accounts',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['user_id', 'user_type'] },
  ],
});

module.exports = HpidAccount;
