const { authorize, ROLES } = require('./authorize');

// patient portal routes, only a patient login token is accepted
const jwtAuth = authorize(ROLES.PATIENT);

module.exports = jwtAuth;
