const { Sequelize } = require('sequelize');
const dbConfig = require('./dbConfig');

const sequelizeDB1 = new Sequelize(dbConfig.db1.DB_NAME, dbConfig.db1.DB_USER, dbConfig.db1.DB_PASSWORD, {
    host: dbConfig.db1.DB_HOST,
    dialect: 'mysql',
    logging: false,
    port: dbConfig.db1.DB_PORT
});

// const sequelizeDB2 = new Sequelize(dbConfig.db2.DB_NAME, dbConfig.db2.DB_USER, dbConfig.db2.DB_PASSWORD, {
//     host: dbConfig.db2.DB_HOST,
//     dialect: 'mysql',
//     logging: false,
//     port: dbConfig.db2.DB_PORT
// });

const authenticateDatabase = async (sequelize, dbName) => {
    try {
        await sequelize.authenticate();
        console.log(`Database connection established for ${dbName}.`);
    } catch (err) {
        console.error(`Unable to connect to the database ${dbName}:`, err);
    }
};

authenticateDatabase(sequelizeDB1, 'db1');
// authenticateDatabase(sequelizeDB2, 'db2');

module.exports = {
    sequelizeDB1,
    // sequelizeDB2
};
