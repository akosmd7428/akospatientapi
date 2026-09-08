const { DataTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

const AssessmentResponse = sequelizeDB1.define('AssessmentResponse', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    assessmentId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    response: {
        type: DataTypes.JSON,
        allowNull: true,
    },
}, {
    tableName: 'assessmentResponse',
    timestamps: true,
});

module.exports = AssessmentResponse;
