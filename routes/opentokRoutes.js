const express = require('express');
const router = express.Router();
const opentokController = require('../controllers/opentokController');
const { authorize, ROLES } = require('../middleware/authorize');
const { loadCareNavigatorScope } = require('../middleware/careNavigatorScope');

// care navigators also get their companies loaded for the session check
const opentokAuth = [
    authorize(ROLES.PATIENT, ROLES.DOCTOR, ROLES.CARE_NAVIGATOR),
    (req, res, next) => req.user.role === ROLES.CARE_NAVIGATOR ? loadCareNavigatorScope(req, res, next) : next(),
];

router.get('/generate-session', authorize(ROLES.DOCTOR, ROLES.CARE_NAVIGATOR), opentokController.generateSession);
router.get('/generate-token', opentokAuth, opentokController.generateToken);

module.exports = router;
