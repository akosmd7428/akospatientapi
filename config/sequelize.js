const { Sequelize } = require('sequelize');
const dbConfig = require('./dbConfig');

const sequelizeDB1 = new Sequelize(dbConfig.db1.DB_NAME, dbConfig.db1.DB_USER, dbConfig.db1.DB_PASSWORD, {
    host: dbConfig.db1.DB_HOST,
    dialect: 'mysql',
    logging: false, // keeps SQL and its bound PHI parameters out of stdout
    port: dbConfig.db1.DB_PORT,
    // SEC-030: PHI travelled between app and database in clear text. Enable with
    // DB_SSL=true once the server presents a certificate; DB_CA_CERT pins it.
    dialectOptions: process.env.DB_SSL === 'true' ? {
        ssl: {
            require: true,
            rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
            ...(process.env.DB_CA_CERT ? { ca: require('fs').readFileSync(process.env.DB_CA_CERT) } : {}),
        },
    } : {},
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
