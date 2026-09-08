const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const Assessment = sequelizeDB1.define('Assessment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  assessmentName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  assessmentImage: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  assessmentType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING,
    defaultValue: 1,
  },
  lastRange: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  totalLevels: {
    type: DataTypes.INTEGER, 
    defaultValue: 1
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  API_URL: {
    type: DataTypes.STRING,
    allowNull: false,
  }
}, {
  tableName: 'assessments',
  timestamps: false
});

// Assessment.belongsTo(PatientAssessment, { foreignKey: 'assessmentId' });

module.exports = Assessment;