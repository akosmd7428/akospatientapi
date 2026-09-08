const express = require('express');
const router = express.Router();
const opentokController = require('../controllers/opentokController');

router.get('/generate-session', opentokController.generateSession);
router.get('/generate-token', opentokController.generateToken);

module.exports = router;
