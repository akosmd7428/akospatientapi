const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class SubLabTest extends Model {}

SubLabTest.init({
    labTestId: DataTypes.INTEGER,
    name: DataTypes.STRING,
    requirements: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    price: DataTypes.DECIMAL,
    mode: {
        type: DataTypes.ENUM,
        values: ['Pathology', 'Radiology'],
        comment: '1=Pathology, 2=Radiology',
        allowNull: false
    },
}, { sequelize: sequelizeDB1, modelName: 'subLabTest', timestamps: true });

module.exports = SubLabTest;
