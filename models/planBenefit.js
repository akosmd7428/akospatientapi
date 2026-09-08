const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const PlanBenefit = sequelizeDB1.define('PlanBenefit', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  carePlanId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'carePlans',
      key: 'id',
    },
  },
  benefit: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    onUpdate: DataTypes.NOW,
  },
}, {
  tableName: 'planBenefits',
  timestamps: true,
});

module.exports = PlanBenefit;
