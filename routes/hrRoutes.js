const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const HrController = require('../controllers/hrController');
const validateSchema = require('../middleware/validateSchema');
const { preEmpAddSchema } = require('../validation/authValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/profile',requireAuth(ROLES.HR), validateDataEncryption(), HrController.getProfileDetails);
router.post('/profile',requireAuth(ROLES.HR), validateDataEncryption(), HrController.createOrUpdateProfile);
router.post('/add-pre-employee',requireAuth(ROLES.HR), validateDataEncryption(),validateSchema(preEmpAddSchema), HrController.createPreEmployee);
router.get('/preEmployee',requireAuth(ROLES.HR), validateDataEncryption(), HrController.getListOfPreEmployee);
router.get('/assesmentHra', requireAuth(ROLES.HR), validateDataEncryption(), HrController.getCompanyHraAssesment);
router.get('/doctorConsultancy', requireAuth(ROLES.HR), validateDataEncryption(), HrController.getEmpTookCall);

router.get('/healthRisk', requireAuth(ROLES.HR), validateDataEncryption(), HrController.getCardioRecords);
router.get('/manageEmployee', requireAuth(ROLES.HR), validateDataEncryption(), HrController.getEmployeeDetails);
router.post('/disableEnableEmployee',requireAuth(ROLES.HR), validateDataEncryption(), HrController.updateEmployeeStatus);
router.post('/addEmployee',requireAuth(ROLES.HR), validateDataEncryption(), HrController.createEmployeesPatient);
router.post('/updateHrProfile',requireAuth(ROLES.HR), validateDataEncryption(), HrController.createOrUpdateProfile);
router.get('/employeeEngagement',requireAuth(ROLES.HR), validateDataEncryption(), HrController.engagementOfEmployee);
router.post('/sendReminder',requireAuth(ROLES.HR), validateDataEncryption(), HrController.sendReminder);
router.post('/send-email',requireAuth(ROLES.HR), validateDataEncryption(), HrController.sendEmailhr);
router.get('/user-module',requireAuth(ROLES.HR), validateDataEncryption(), HrController.getUserModule);

// router.get('/appointments',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.getAppointments);
// router.post('/reschedule',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.rescheduleAppointment);
// router.post('/cancel',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.cancelAppointment);
// router.post('/approve',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.approveAppointment);
// router.get('/patients',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.getAllPatients);
// router.get('/myPatients',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.getMyPatients);
// router.get('/labTests',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.getLabTests);
// router.get('/dashboard', requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.dashboard);
// router.get('/prescriptions',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.prescriptions);
// router.post('/updateLabOrder',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.updateLabOrder);
// router.post('/uploadLabReport', requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.uploadLabReport);
// router.get('/getPackages',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.getPackages);
// router.post('/updateAppointment',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.updateAppointment);
// router.post('/send-email',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.sendEmail);
// router.get('/orders/:orderId',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.getLabOrdersByPatient);
// router.post('/login',validateDataEncryption(), validateSchema(loginPatientSchema), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.login);
// router.post('/uploadPrescription',validateDataEncryption(), requireAuth(ROLES.CARE_NAVIGATOR), CareNavigatorController.uploadPrescription);
module.exports = router;
