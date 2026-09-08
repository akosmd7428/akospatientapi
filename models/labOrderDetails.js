const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class LabOrderDetails extends Model {}

LabOrderDetails.init({
    labOrderId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    cartId: DataTypes.INTEGER,
    type: {
        type: DataTypes.ENUM,
        values: ['Test', 'Package'],
        comment: '1=Test, 2=Package',
        allowNull: false
    },
    mode: {
        type: DataTypes.ENUM,
        values: ['Pathology', 'Radiology'],
        comment: '1=Pathology, 2=Radiology',
        allowNull: false
    },
    referenceId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    modeOfTest: DataTypes.STRING,
    noOfTest: DataTypes.INTEGER,
    price: {
        type: DataTypes.DECIMAL,
        allowNull: false
    },
    discount: DataTypes.DECIMAL,
    total: {
        type: DataTypes.DECIMAL,
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    isDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
        labId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    labType: {
        type: DataTypes.STRING,
        allowNull: true
    },
    code: {
        type: DataTypes.STRING,
        allowNull: true
    },
    companyIdPackageTest: DataTypes.INTEGER,
    patientCompanyId: DataTypes.INTEGER,

}, { 
    sequelize: sequelizeDB1, 
    tableName: 'labOrderDetails', 
    timestamps: true 
});

module.exports = LabOrderDetails;
