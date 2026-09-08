const express = require('express');
const router = express.Router();
const AppointmentController = require('../controllers/appointmentController');
const { bookAppointmentValidation, rescheduleAppointmentValidation, cancelAppointmentValidation } = require('../validation/bookAppointmentValidation');
const validateSchema = require('../middleware/validateSchema');
const jwtAuth = require('../middleware/jwtAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
router.post('/book',validateDataEncryption(),jwtAuth, validateSchema(bookAppointmentValidation), AppointmentController.bookAppointment);
router.get('/get/:status',validateDataEncryption(),jwtAuth, AppointmentController.getAppointments);
router.get('/my-medicines',validateDataEncryption(), jwtAuth, AppointmentController.myMedicines);

router.post('/reschedule',validateDataEncryption(), jwtAuth, validateSchema(rescheduleAppointmentValidation), AppointmentController.rescheduleAppointment);
router.post('/cancel',validateDataEncryption(), jwtAuth, validateSchema(cancelAppointmentValidation), AppointmentController.cancelAppointment);

router.get('/details/:appointmentId',validateDataEncryption(),jwtAuth, AppointmentController.getAppointmentDetails);
router.get('/medical-records/:companyId',validateDataEncryption(), jwtAuth, AppointmentController.getMedicalRecords);
router.get('/talkToDoctor',validateDataEncryption(), jwtAuth, AppointmentController.talkToDoctor);
router.get('/dashboard',validateDataEncryption(),jwtAuth, AppointmentController.dashboard);

router.post('/fetchCallDetails',validateDataEncryption(), jwtAuth, AppointmentController.fetchCallDetails);

router.post('/check-appointment-status',validateDataEncryption(), jwtAuth,validateSchema(bookAppointmentValidation), AppointmentController.checkAppointmentStatus);

module.exports = router;
