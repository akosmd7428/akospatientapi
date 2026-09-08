const express = require('express');
const CareNavigatorController = require('../controllers/careNavigatorController');
const jwtAuthCareNavigator = require('../middleware/jwtAuthCareNavigator');
const validateSchema = require('../middleware/validateSchema');
const { loginPatientSchema } = require('../validation/authValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/profile',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.getProfileDetails);
router.post('/profile',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.createOrUpdateProfile);
router.get('/appointments',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.getAppointments);
router.post('/reschedule',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.rescheduleAppointment);
router.post('/cancel',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.cancelAppointment);
router.post('/approve',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.approveAppointment);
router.get('/patients',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.getAllPatients);
router.get('/myPatients',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.getMyPatients);
router.get('/labTests',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.getLabTests);
router.get('/dashboard', validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.dashboard);
router.get('/prescriptions',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.prescriptions);
router.post('/updateLabOrder',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.updateLabOrder);
router.post('/uploadLabReport',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.uploadLabReport);
router.get('/getPackages',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.getPackages);
router.post('/updateAppointment',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.updateAppointment);
router.post('/send-email',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.sendEmail);
router.get('/orders/:orderId',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.getLabOrdersByPatient);
router.post('/login',validateDataEncryption(), validateSchema(loginPatientSchema), jwtAuthCareNavigator, CareNavigatorController.login);
router.post('/uploadPrescription',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.uploadPrescription);

router.get('/preemployeelabTests',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.getPreEmpLabTests);
router.post('/updatePreLabReport',validateDataEncryption(), jwtAuthCareNavigator, CareNavigatorController.updateLabPreLabReport);

module.exports = router;
