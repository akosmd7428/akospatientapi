const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class LabPackage extends Model {}

LabPackage.init({
    packageName: DataTypes.STRING,
    noOfTest: DataTypes.INTEGER,
    notes: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    price: DataTypes.DECIMAL,
    discount: DataTypes.DECIMAL,
    mode: {
        type: DataTypes.ENUM,
        values: ['Pathology', 'Radiology'],
        comment: '1=Pathology, 2=Radiology',
        allowNull: false
    },
}, { sequelize: sequelizeDB1, tableName: 'labPackage', timestamps: true });

module.exports = LabPackage;
