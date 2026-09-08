const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class LabsCategory extends Model {}

LabsCategory.init({
    categoryName: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, tableName: 'labsCategory', timestamps: true });

module.exports = LabsCategory;
