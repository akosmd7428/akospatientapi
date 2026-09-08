const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const Logs = sequelizeDB1.define('logs', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  errorMessage: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  functionName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  lineNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  additionalData: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  role: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'logs',
  timestamps: false
});

module.exports = Logs;