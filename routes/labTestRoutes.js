const express = require('express');
const LabTestController = require('../controllers/labTestController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const validateSchema = require('../middleware/validateSchema');
const { addToCartSchema } = require('../validation/cartValidator');
const { uploadPrescriptionSchema } = require('../validation/prescriptionValidator');
const { labOrderValidation } = require('../validation/labOrderValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/packages-and-tests',validateDataEncryption(),jwtAuth, LabTestController.getPackagesAndTests);
router.post('/upload',validateDataEncryption(),jwtAuth, validateSchema(uploadPrescriptionSchema), LabTestController.uploadPrescription);
router.post('/addToCart',validateDataEncryption(),jwtAuth, validateSchema(addToCartSchema), LabTestController.addToCart);
router.get('/cities',validateDataEncryption(), jwtAuth, LabTestController.getAllActiveCities);
router.post('/cart/details',validateDataEncryption(),jwtAuth, LabTestController.getCartDetailsByPatientId);
router.post('/cart/lab-details',validateDataEncryption(), jwtAuth, LabTestController.getLabDetailsByCart);
router.post('/branches',validateDataEncryption(),jwtAuth, LabTestController.getBranchesByLabAndCity);
router.post('/tests-and-packages',validateDataEncryption(), jwtAuth, LabTestController.getTestsAndPackagesByLab);
router.post('/test-or-package-details',validateDataEncryption(), jwtAuth, LabTestController.getTestOrPackageDetails);
router.delete('/remove/:cartId',validateDataEncryption(), jwtAuth, LabTestController.removeCartItem);
router.get('/prescription/:patientId',validateDataEncryption(), jwtAuth, LabTestController.getPrescriptionUrl);
router.delete('/prescription/:prescriptionId', jwtAuth, LabTestController.deletePrescription);
router.post('/order',validateDataEncryption(),jwtAuth, LabTestController.createLabOrder);
router.get('/orders/:orderId', jwtAuth, LabTestController.getLabOrdersByPatient);
router.put('/order/reschedule',validateDataEncryption(), jwtAuth, LabTestController.rescheduleLabOrder);
router.put('/order',validateDataEncryption(), LabTestController.updateLabOrder);
router.get('/list/:patientId',validateDataEncryption(), jwtAuth, LabTestController.getLabOrders);
router.delete('/cartRemove/:cartId',validateDataEncryption(), jwtAuth, LabTestController.removeCart);
router.put('/cart',validateDataEncryption(), jwtAuth, LabTestController.updateLabId);
router.get('/labDetail/:cartId',validateDataEncryption(), jwtAuth, LabTestController.getLabDetail);
router.get('/cart/sub-city-prices/:cartId',validateDataEncryption(), jwtAuth, LabTestController.getSubCityCartPrices);
router.post('/purchaseLabTest',validateDataEncryption(), jwtAuth, LabTestController.purchaseLabTest);
router.post('/purchaseLabTestMobile',validateDataEncryption(), jwtAuth, LabTestController.purchaseLabTestMobile);

router.post('/labtestnotification', jwtAuth, LabTestController.labtestNotification);
router.post('/re-schedule-lab',validateDataEncryption(), jwtAuth, LabTestController.labReschedule);

router.post('/paymentStatus',validateDataEncryption(), jwtAuth, LabTestController.paymentStatus);
router.post('/paymentStatusMobile',validateDataEncryption(),validateDataEncryption(), LabTestController.paymentStatusMobile);

router.put('/updateAddress',validateDataEncryption(), jwtAuth, LabTestController.updateAddress);
router.get('/getLabTestAddress',validateDataEncryption(), jwtAuth, LabTestController.getLabTestAddress);

// redcliff get aloc number
router.get('/getRedcliffAloc',validateDataEncryption(), LabTestController.getRedcliffAloc);
router.post('/getRedcliffSlot',validateDataEncryption(), LabTestController.getBookingSlot);
router.post('/createRedcliffBooking',validateDataEncryption(), LabTestController.createRedcliffBooking);
router.post('/redCliffReport', LabTestController.redCliffReport);
router.post('/fetchRedcliffReport', LabTestController.getRedcliffReport);

router.get('/sub-cities/:cityId',validateDataEncryption(), jwtAuth,LabTestController.getSubCitiesByCityId);
router.get('/patient-company-details',validateDataEncryption(), jwtAuth,LabTestController.getPatientCompanyDetails);
router.get('/check-payment-status',validateDataEncryption(), jwtAuth,LabTestController.checkCallPaymentStatus);
router.post('/create-payment-call',validateDataEncryption(), jwtAuth,LabTestController.postPaymentCall);
router.post('/verify-call-coupon',validateDataEncryption(), jwtAuth,LabTestController.verifyCallCoupan);
router.post('/paymentStatusCallCheck',validateDataEncryption(), jwtAuth,LabTestController.paymentStatusCallCheck);

router.post('/cart/unpaid-lab-details',validateDataEncryption(),jwtAuth, LabTestController.getUnpaidLabForItem);
//router.post('/check-lab-code',validateDataEncryption(),jwtAuth, LabTestController.getLabItemWithCode);




module.exports = router;
