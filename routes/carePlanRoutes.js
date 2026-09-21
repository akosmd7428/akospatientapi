const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const router = express.Router();
const CarePlanController = require('../controllers/carePlanController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/plan',requireAuth(ROLES.PATIENT), validateDataEncryption(), CarePlanController.getCarePlanDetails);

module.exports = router;
