const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const HelpFaq = sequelizeDB1.define('HelpFaq', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  }
}, {
  tableName: 'help_faq',
});

module.exports = HelpFaq;
