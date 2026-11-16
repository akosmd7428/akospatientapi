const express = require('express');
const CareNavigatorController = require('../controllers/careNavigatorController');
const jwtAuthCareNavigator = require('../middleware/jwtAuthCareNavigator');
const validateSchema = require('../middleware/validateSchema');
const { loginPatientSchema } = require('../validation/authValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/profile', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getProfileDetails);
router.post('/profile', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.createOrUpdateProfile);
router.get('/appointments', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getAppointments);
router.post('/reschedule', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.rescheduleAppointment);
router.post('/cancel', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.cancelAppointment);
router.post('/approve', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.approveAppointment);
router.get('/patients', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getAllPatients);
router.get('/myPatients', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getMyPatients);
router.get('/labTests', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getLabTests);
router.get('/dashboard', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.dashboard);
router.get('/prescriptions', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.prescriptions);
router.post('/updateLabOrder', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.updateLabOrder);
router.get('/order-labs/:orderId', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getOrderLabs);
router.get('/lab-cities', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getLabCities);
router.get('/sub-cities/:cityId', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getSubCities);
router.post('/uploadLabReport', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.uploadLabReport);
router.get('/getPackages', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getPackages);
router.post('/updateAppointment', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.updateAppointment);
router.post('/send-email', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.sendEmail);
router.get('/orders/:orderId', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getLabOrdersByPatient);
router.post('/login', jwtAuthCareNavigator, validateDataEncryption(), validateSchema(loginPatientSchema), CareNavigatorController.login);
router.post('/uploadPrescription', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.uploadPrescription);

router.get('/preemployeelabTests', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.getPreEmpLabTests);
router.post('/updatePreLabReport', jwtAuthCareNavigator, validateDataEncryption(), CareNavigatorController.updateLabPreLabReport);

module.exports = router;
