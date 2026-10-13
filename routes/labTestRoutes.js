const express = require('express');
const LabTestController = require('../controllers/labTestController');
const jwtAuth = require('../middleware/jwtAuth'); // Middleware to check JWT
const validateSchema = require('../middleware/validateSchema');
const { addToCartSchema } = require('../validation/cartValidator');
const { uploadPrescriptionSchema } = require('../validation/prescriptionValidator');
const { labOrderValidation } = require('../validation/labOrderValidation');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const { authorize, ROLES } = require('../middleware/authorize');
const { loadCareNavigatorScope } = require('../middleware/careNavigatorScope');
const crypto = require('crypto');
const router = express.Router();

// care navigator company scope, only loaded for a care navigator token
const careNavigatorScopeIfNeeded = (req, res, next) => (
    req.user.role === ROLES.CARE_NAVIGATOR ? loadCareNavigatorScope(req, res, next) : next()
);
const patientOrCareNavigator = [authorize(ROLES.PATIENT, ROLES.CARE_NAVIGATOR), careNavigatorScopeIfNeeded];

// redcliff webhooks carry a shared secret in the x-webhook-secret header (REDCLIFF_WEBHOOK_SECRET),
// rejected when the secret is not configured
const verifyRedcliffWebhook = (req, res, next) => {
    const secret = process.env.REDCLIFF_WEBHOOK_SECRET;
    const given = Buffer.from(String(req.header('x-webhook-secret') || ''));
    const expected = Buffer.from(String(secret || ''));
    if (!secret || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

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
router.get('/prescription/:patientId',validateDataEncryption(), patientOrCareNavigator, LabTestController.getPrescriptionUrl);
router.delete('/prescription/:prescriptionId', patientOrCareNavigator, LabTestController.deletePrescription);
router.post('/order',validateDataEncryption(),jwtAuth, LabTestController.createLabOrder);
router.get('/orders/:orderId', jwtAuth, LabTestController.getLabOrdersByPatient);
router.put('/order/reschedule',validateDataEncryption(), jwtAuth, LabTestController.rescheduleLabOrder);
router.put('/order',validateDataEncryption(),jwtAuth, LabTestController.updateLabOrder);
router.get('/list/:patientId',validateDataEncryption(), jwtAuth, LabTestController.getLabOrders);
router.delete('/cartRemove/:cartId',validateDataEncryption(), jwtAuth, LabTestController.removeCart);
router.put('/cart',validateDataEncryption(), jwtAuth, LabTestController.updateLabId);
router.get('/labDetail/:cartId',validateDataEncryption(), jwtAuth, LabTestController.getLabDetail);
router.get('/cart/sub-city-prices/:cartId',validateDataEncryption(), jwtAuth, LabTestController.getSubCityCartPrices);
router.post('/purchaseLabTest',validateDataEncryption(), jwtAuth, LabTestController.purchaseLabTest);
router.post('/purchaseLabTestMobile',validateDataEncryption(), jwtAuth, LabTestController.purchaseLabTestMobile);

router.post('/labtestnotification', jwtAuth, LabTestController.labtestNotification);
router.post('/re-schedule-lab',validateDataEncryption(), patientOrCareNavigator, LabTestController.labReschedule);

router.post('/paymentStatus',validateDataEncryption(), jwtAuth, LabTestController.paymentStatus);
// no login on the razorpay callback, the controller verifies the razorpay signature
router.post('/paymentStatusMobile',validateDataEncryption(), LabTestController.paymentStatusMobile);

router.put('/updateAddress',validateDataEncryption(), jwtAuth, LabTestController.updateAddress);
router.get('/getLabTestAddress',validateDataEncryption(), jwtAuth, LabTestController.getLabTestAddress);

// redcliff get aloc number
router.get('/getRedcliffAloc',validateDataEncryption(), jwtAuth, LabTestController.getRedcliffAloc);
router.post('/getRedcliffSlot',validateDataEncryption(), jwtAuth, LabTestController.getBookingSlot);
router.post('/createRedcliffBooking',validateDataEncryption(), jwtAuth, LabTestController.createRedcliffBooking);
router.post('/redCliffReport', verifyRedcliffWebhook, LabTestController.redCliffReport);
router.post('/fetchRedcliffReport', verifyRedcliffWebhook, LabTestController.getRedcliffReport);

router.get('/sub-cities/:cityId',validateDataEncryption(), jwtAuth,LabTestController.getSubCitiesByCityId);
router.get('/patient-company-details',validateDataEncryption(), jwtAuth,LabTestController.getPatientCompanyDetails);
router.get('/check-payment-status',validateDataEncryption(), jwtAuth,LabTestController.checkCallPaymentStatus);
router.post('/create-payment-call',validateDataEncryption(), jwtAuth,LabTestController.postPaymentCall);
router.post('/verify-call-coupon',validateDataEncryption(), jwtAuth,LabTestController.verifyCallCoupan);
router.post('/paymentStatusCallCheck',validateDataEncryption(), jwtAuth,LabTestController.paymentStatusCallCheck);

router.post('/cart/unpaid-lab-details',validateDataEncryption(),jwtAuth, LabTestController.getUnpaidLabForItem);
//router.post('/check-lab-code',validateDataEncryption(),jwtAuth, LabTestController.getLabItemWithCode);




module.exports = router;
