const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class LabTest extends Model {}

LabTest.init({
    labId: DataTypes.INTEGER,
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
    requirements: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    price: DataTypes.DECIMAL,
    discount: DataTypes.DECIMAL,
    mode: {
        type: DataTypes.ENUM,
        values: ['Pathology', 'Radiology'],
        comment: '1=Pathology, 2=Radiology',
        allowNull: false
    },}, { sequelize: sequelizeDB1, tableName: 'labTest', timestamps: true });

module.exports = LabTest;
