const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class Medication extends Model {}
Medication.init({
    categoryName: DataTypes.STRING,
    medicationName: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, modelName: 'medication', timestamps: true });

class HealthProblem extends Model {}
HealthProblem.init({
    problemName: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, modelName: 'healthProblem', timestamps: true });

class Symptom extends Model {}
Symptom.init({
    categoryName: DataTypes.STRING,
    symptomsName: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, modelName: 'symptom', timestamps: true });

class Vaccination extends Model {}
Vaccination.init({
    categoryName: DataTypes.STRING,
    vaccinationName: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, modelName: 'vaccination', timestamps: true });

class Allergy extends Model {}
Allergy.init({
    categoryName: DataTypes.STRING,
    allergiesName: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, modelName: 'allergy', timestamps: true });

class FamilyRelation extends Model {}
FamilyRelation.init({
    relationName: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, modelName: 'familyRelation', timestamps: true });

class State extends Model {}
State.init({
    name: DataTypes.STRING,
    country_id: DataTypes.INTEGER
}, { sequelize: sequelizeDB1, tableName: 'states', timestamps: true });

class City extends Model {}
City.init({
    state_id: DataTypes.INTEGER,
    city: DataTypes.STRING,
    zip: DataTypes.STRING
}, { sequelize: sequelizeDB1, tableName: 'cities', timestamps: false });

class DrugForms extends Model {}
DrugForms.init({
    drugFormName: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, tableName: 'drugForms', timestamps: true });


class Frequency extends Model {}
Frequency.init({
    frequencyName: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { sequelize: sequelizeDB1, tableName: 'frequency', timestamps: true });


module.exports = { Medication, HealthProblem, Symptom, Vaccination, Allergy, FamilyRelation, City, State, DrugForms, Frequency };
