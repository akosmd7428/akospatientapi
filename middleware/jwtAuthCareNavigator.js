const { authorize, ROLES } = require('./authorize');
const { loadCareNavigatorScope } = require('./careNavigatorScope');

// care navigator routes, only a care navigator login token is accepted and
// req.careCompanyIds is filled from the database
const jwtAuthCareNavigator = [authorize(ROLES.CARE_NAVIGATOR), loadCareNavigatorScope];

module.exports = jwtAuthCareNavigator;
