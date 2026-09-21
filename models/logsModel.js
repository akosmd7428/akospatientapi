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
  // SEC-016 / SEC-024: `timestamps: false` meant there was no createdAt, so no
  // retention or purge policy could be implemented and the table - which held
  // raw request bodies - grew without bound. createdAt is required for the
  // purge job in helpers/logRetention.js.
  timestamps: true,
  updatedAt: false,
});

module.exports = Logs;