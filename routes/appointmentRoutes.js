const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const router = express.Router();
const AppointmentController = require('../controllers/appointmentController');
const { bookAppointmentValidation, rescheduleAppointmentValidation, cancelAppointmentValidation } = require('../validation/bookAppointmentValidation');
const validateSchema = require('../middleware/validateSchema');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.post('/book',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(bookAppointmentValidation), AppointmentController.bookAppointment);
router.get('/get/:status',requireAuth(ROLES.PATIENT), validateDataEncryption(), AppointmentController.getAppointments);
router.get('/my-medicines',requireAuth(ROLES.PATIENT), validateDataEncryption(), AppointmentController.myMedicines);

router.post('/reschedule',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(rescheduleAppointmentValidation), AppointmentController.rescheduleAppointment);
router.post('/cancel',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(cancelAppointmentValidation), AppointmentController.cancelAppointment);

router.get('/details/:appointmentId',requireAuth(ROLES.PATIENT), validateDataEncryption(), AppointmentController.getAppointmentDetails);
router.get('/medical-records/:companyId',requireAuth(ROLES.PATIENT), validateDataEncryption(), AppointmentController.getMedicalRecords);
router.get('/talkToDoctor',requireAuth(ROLES.PATIENT), validateDataEncryption(), AppointmentController.talkToDoctor);
router.get('/dashboard',requireAuth(ROLES.PATIENT), validateDataEncryption(), AppointmentController.dashboard);

router.post('/fetchCallDetails',requireAuth(ROLES.PATIENT), validateDataEncryption(), AppointmentController.fetchCallDetails);

router.post('/check-appointment-status',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(bookAppointmentValidation), AppointmentController.checkAppointmentStatus);

module.exports = router;
