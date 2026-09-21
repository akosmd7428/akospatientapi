const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const router = express.Router();
const DataController = require('../controllers/dataController');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/patient/:type',requireAuth(ROLES.PATIENT), validateDataEncryption(), DataController.getData);
router.get('/states',validateDataEncryption(),  DataController.getStates);
router.get('/cities',validateDataEncryption(),  DataController.getCities);
router.post('/upload', requireAuth(ROLES.PATIENT), validateDataEncryption(), DataController.uploadFile);
router.post('/getTalkToDoctorCallListApi',requireAuth(ROLES.PATIENT), validateDataEncryption(), DataController.getTalkToDoctorCallListApi);
router.get('/states-hr',validateDataEncryption(),  DataController.getStates);
router.get('/cities-hr',validateDataEncryption(),  DataController.getCities);
router.get('/states-carenavigator',validateDataEncryption(),  DataController.getStates);
router.get('/cities-carenavigator',validateDataEncryption(),  DataController.getCities);
module.exports = router;
