const { authorize, ROLES } = require('./authorize');

// hr portal routes, only an hr login token is accepted
const jwtAuthHr = authorize(ROLES.HR);

module.exports = jwtAuthHr;
