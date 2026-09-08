const express = require('express');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const router = express.Router();
const patientFolderController = require('../controllers/patientFolderController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/folders',validateDataEncryption(), jwtAuth, patientFolderController.getFolders);
router.get('/files',validateDataEncryption(), jwtAuth, patientFolderController.getFiles);

module.exports = router;
