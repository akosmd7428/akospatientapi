const { sequelizeDB1 } = require('../config/sequelize');
const { DataTypes } = require('sequelize');

const MedicinePrescribed = sequelizeDB1.define('MedicinePrescribed', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    prescriptionId : {
      type: DataTypes.STRING,
      allowNull: false,
    },
    medicineId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    medicineName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    frequency: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    duration: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    drugForm: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    strength: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    instructions: {
      type: DataTypes.STRING(255),
      allowNull: true,
    }
  }, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    tableName: 'medicinePrescribed',
  });
  
  module.exports = MedicinePrescribed;