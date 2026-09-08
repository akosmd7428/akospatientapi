
const { DB_HOST1, DB_USER1, DB_PASSWORD1, DB_PORT1, DB_NAME1 } = require('./secret');

module.exports = {
    db1: {
        DB_HOST: DB_HOST1,
        DB_USER: DB_USER1,
        DB_PASSWORD: DB_PASSWORD1,
        DB_PORT: DB_PORT1,
        DB_NAME: DB_NAME1
    },
    db2: {
        DB_HOST: 'host2',
        DB_USER: 'user2',
        DB_PASSWORD: 'password2',
        DB_PORT: 3306,
        DB_NAME: 'database2'
    }
};
