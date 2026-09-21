
const { DB_HOST1, DB_USER1, DB_PASSWORD1, DB_PORT1, DB_NAME1 } = require('./secret');

module.exports = {
    db1: {
        DB_HOST: DB_HOST1,
        DB_USER: DB_USER1,
        DB_PASSWORD: DB_PASSWORD1,
        DB_PORT: DB_PORT1,
        DB_NAME: DB_NAME1
    },
    // SEC-030: the db2 block held placeholder credentials ('user2'/'password2')
    // as literals in a git-tracked file. It was unused, and a template that
    // invites a real credential to be pasted into source. It reads from the
    // environment now, like db1.
    db2: {
        DB_HOST: process.env.DB_HOST2,
        DB_USER: process.env.DB_USER2,
        DB_PASSWORD: process.env.DB_PASSWORD2,
        DB_PORT: process.env.DB_PORT2 || 3306,
        DB_NAME: process.env.DB_NAME2
    }
};
