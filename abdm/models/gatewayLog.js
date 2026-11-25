const { sequelizeDB1 } = require('../../config/sequelize');
const { DataTypes } = require('sequelize');

const GatewayLog = sequelizeDB1.define('abdm_gateway_log', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  request_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  module: {
    type: DataTypes.ENUM('m1', 'm2', 'm3', 'm4'),
    allowNull: false,
  },
  operation: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  direction: {
    type: DataTypes.ENUM('outgoing', 'incoming_callback'),
    allowNull: false,
  },
  request_payload: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  response_status: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  response_payload: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  error_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
}, {
  tableName: 'abdm_gateway_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = GatewayLog;
