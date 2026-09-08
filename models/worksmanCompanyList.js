// models/ConnectedCompaniesPatient.js
const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class WorksmanCompanyList extends Model {}

WorksmanCompanyList.init({
    company_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    employer_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    parent_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    client_secret: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
     api_ip_whitelist: {
        type: DataTypes.STRING,
        allowNull: true
    },
    api_access: {
        type: DataTypes.STRING,
        allowNull: true,
         defaultValue: 0
    },

        api_ip_restriction: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
      },  
    legacy_corporate_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    is_migrated: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },

}, {
    sequelize: sequelizeDB1,
    tableName: 'worksman_company_list',
    timestamps: true
});

module.exports = WorksmanCompanyList;
