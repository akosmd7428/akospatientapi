const express = require('express');
const router = express.Router();
const DataController = require('../controllers/dataController');
const jwtAuth = require('../middleware/jwtAuth');
const { authorize, ROLES } = require('../middleware/authorize');
// master lists and uploads are used by the patient, care navigator and hr portals
const portalUsers = authorize(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR);
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.get('/patient/:type',validateDataEncryption(), portalUsers, DataController.getData);
router.get('/states',validateDataEncryption(),  DataController.getStates);
router.get('/cities',validateDataEncryption(),  DataController.getCities);
router.post('/upload', validateDataEncryption(), portalUsers, DataController.uploadFile);
router.post('/getTalkToDoctorCallListApi',validateDataEncryption(), jwtAuth, DataController.getTalkToDoctorCallListApi);
router.get('/states-hr',validateDataEncryption(),  DataController.getStates);
router.get('/cities-hr',validateDataEncryption(),  DataController.getCities);
router.get('/states-carenavigator',validateDataEncryption(),  DataController.getStates);
router.get('/cities-carenavigator',validateDataEncryption(),  DataController.getCities);
module.exports = router;
