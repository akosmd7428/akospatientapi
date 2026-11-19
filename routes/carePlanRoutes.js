const express = require('express');
const router = express.Router();
const CarePlanController = require('../controllers/carePlanController');
const PlanServiceController = require('../controllers/planServiceController');
const planRoute = require('../helpers/planRoute');
const jwtAuth = require('../middleware/jwtAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/plan', jwtAuth, validateDataEncryption(), planRoute(PlanServiceController.getCarePlanDetails, CarePlanController.getCarePlanDetails));
// plan values (planValue, used, remaining per service) of the logged in user's company care plan
router.get('/plan-value', jwtAuth, validateDataEncryption(), PlanServiceController.getPlanValue);

module.exports = router;
