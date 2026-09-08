const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const HealthScoreCalculation = sequelizeDB1.define('HealthScoreCalculation', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    minScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    maxScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    depressionSeverity: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    assessmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
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
    tableName: 'healthScoreCalculation',
});

module.exports = HealthScoreCalculation;
