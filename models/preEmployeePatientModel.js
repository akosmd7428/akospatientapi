const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class PreEmployeePatient extends Model {}

PreEmployeePatient.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    phone: {
        type: DataTypes.STRING(20)
    },    
    gender: {
        type: DataTypes.ENUM('Male', 'Female', 'Other')
    },
    age: {
        type: DataTypes.INTEGER
    },
    dateofbirth: {
        type: DataTypes.DATE
    },
    city: {
        type: DataTypes.INTEGER
    },
    state: {
        type: DataTypes.INTEGER
    },
    zip_code: {
        type: DataTypes.STRING(10)
    },   
    type: {
        type: DataTypes.STRING(10)
    },  
    companyId: {
        type: DataTypes.INTEGER
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    isDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    health_check_up_date:{
        type: DataTypes.DATE,
        defaultValue: null
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    report_url: {
        type: DataTypes.STRING(255)
    },
    report_remark: {
        type: DataTypes.TEXT
    }   
    
}, {
    sequelize: sequelizeDB1,
    tableName: 'preemployeepatient',
    timestamps: true
});

module.exports = PreEmployeePatient;
