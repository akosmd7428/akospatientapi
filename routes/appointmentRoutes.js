const express = require('express');
const router = express.Router();
const AppointmentController = require('../controllers/appointmentController');
const { bookAppointmentValidation, rescheduleAppointmentValidation, cancelAppointmentValidation } = require('../validation/bookAppointmentValidation');
const validateSchema = require('../middleware/validateSchema');
const jwtAuth = require('../middleware/jwtAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.post('/book', jwtAuth, validateDataEncryption(), validateSchema(bookAppointmentValidation), AppointmentController.bookAppointment);
router.get('/get/:status', jwtAuth, validateDataEncryption(), AppointmentController.getAppointments);
router.get('/my-medicines', jwtAuth, validateDataEncryption(), AppointmentController.myMedicines);

router.post('/reschedule', jwtAuth, validateDataEncryption(), validateSchema(rescheduleAppointmentValidation), AppointmentController.rescheduleAppointment);
router.post('/cancel', jwtAuth, validateDataEncryption(), validateSchema(cancelAppointmentValidation), AppointmentController.cancelAppointment);

router.get('/details/:appointmentId', jwtAuth, validateDataEncryption(), AppointmentController.getAppointmentDetails);
router.get('/medical-records/:companyId', jwtAuth, validateDataEncryption(), AppointmentController.getMedicalRecords);
router.get('/talkToDoctor', jwtAuth, validateDataEncryption(), AppointmentController.talkToDoctor);
router.get('/connect-token', jwtAuth, validateDataEncryption(), AppointmentController.connectToken);
router.get('/dashboard', jwtAuth, validateDataEncryption(), AppointmentController.dashboard);

router.post('/fetchCallDetails', jwtAuth, validateDataEncryption(), AppointmentController.fetchCallDetails);

router.post('/check-appointment-status', jwtAuth, validateDataEncryption(),validateSchema(bookAppointmentValidation), AppointmentController.checkAppointmentStatus);

module.exports = router;
