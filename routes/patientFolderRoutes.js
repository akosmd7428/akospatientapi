const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const router = express.Router();
const patientFolderController = require('../controllers/patientFolderController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/folders',requireAuth(ROLES.PATIENT), validateDataEncryption(), patientFolderController.getFolders);
router.get('/files',requireAuth(ROLES.PATIENT), validateDataEncryption(), patientFolderController.getFiles);

module.exports = router;
