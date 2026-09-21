const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const CareNavigatorController = require('../controllers/careNavigatorController');
const validateSchema = require('../middleware/validateSchema');
const { loginPatientSchema } = require('../validation/authValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/profile',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.getProfileDetails);
router.post('/profile',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.createOrUpdateProfile);
router.get('/appointments',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.getAppointments);
router.post('/reschedule',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.rescheduleAppointment);
router.post('/cancel',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.cancelAppointment);
router.post('/approve',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.approveAppointment);
router.get('/patients',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.getAllPatients);
router.get('/myPatients',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.getMyPatients);
router.get('/labTests',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.getLabTests);
router.get('/dashboard', requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.dashboard);
router.get('/prescriptions',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.prescriptions);
router.post('/updateLabOrder',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.updateLabOrder);
router.post('/uploadLabReport',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.uploadLabReport);
router.get('/getPackages',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.getPackages);
router.post('/updateAppointment',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.updateAppointment);
router.post('/send-email',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.sendEmail);
router.get('/orders/:orderId',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.getLabOrdersByPatient);
// SEC-012: renamed from /login, which implied authentication and hid what it did.
// Requires a stated reason, checks the patient is in the navigator's own company,
// writes an audit record, and issues a 15-minute token marked as an impersonation.
router.post('/impersonate',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), validateSchema(loginPatientSchema), CareNavigatorController.impersonatePatient);
router.post('/uploadPrescription',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.uploadPrescription);

router.get('/preemployeelabTests',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.getPreEmpLabTests);
router.post('/updatePreLabReport',requireAuth(ROLES.CARE_NAVIGATOR), validateDataEncryption(), CareNavigatorController.updateLabPreLabReport);

module.exports = router;
