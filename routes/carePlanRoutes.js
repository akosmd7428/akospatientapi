const express = require('express');
const router = express.Router();
const CarePlanController = require('../controllers/carePlanController');
const jwtAuth = require('../middleware/jwtAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/plan',validateDataEncryption(), jwtAuth, CarePlanController.getCarePlanDetails);

module.exports = router;
