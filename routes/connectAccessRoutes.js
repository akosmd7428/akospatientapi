const express = require('express');
const router = express.Router();
const ConnectAccessController = require('../controllers/connectAccessController');
const { connectVerifyCodeValidation } = require('../validation/connectAccessValidation');
const validateSchema = require('../middleware/validateSchema');
const jwtAuth = require('../middleware/jwtAuth');
const validateDataEncryption = require('../middleware/validateDataEncryption');

router.post('/generate-code', validateDataEncryption(), jwtAuth, ConnectAccessController.generateCode);
router.post('/verify-code', validateDataEncryption(), jwtAuth, validateSchema(connectVerifyCodeValidation), ConnectAccessController.verifyCode);

module.exports = router;
