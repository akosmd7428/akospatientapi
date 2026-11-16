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

router.get('/packages-and-tests', jwtAuth, validateDataEncryption(), LabTestController.getPackagesAndTests);
router.post('/upload', jwtAuth, validateDataEncryption(), validateSchema(uploadPrescriptionSchema), LabTestController.uploadPrescription);
router.post('/addToCart', jwtAuth, validateDataEncryption(), validateSchema(addToCartSchema), LabTestController.addToCart);
router.get('/cities', jwtAuth, validateDataEncryption(), LabTestController.getAllActiveCities);
router.post('/cart/details', jwtAuth, validateDataEncryption(), LabTestController.getCartDetailsByPatientId);
router.post('/cart/lab-details', jwtAuth, validateDataEncryption(), LabTestController.getLabDetailsByCart);
router.post('/branches', jwtAuth, validateDataEncryption(), LabTestController.getBranchesByLabAndCity);
router.post('/tests-and-packages', jwtAuth, validateDataEncryption(), LabTestController.getTestsAndPackagesByLab);
router.post('/test-or-package-details', jwtAuth, validateDataEncryption(), LabTestController.getTestOrPackageDetails);
router.delete('/remove/:cartId', jwtAuth, validateDataEncryption(), LabTestController.removeCartItem);
router.get('/prescription/:patientId', patientOrCareNavigator, validateDataEncryption(), LabTestController.getPrescriptionUrl);
router.delete('/prescription/:prescriptionId', patientOrCareNavigator, LabTestController.deletePrescription);
router.post('/order', jwtAuth, validateDataEncryption(), LabTestController.createLabOrder);
router.get('/orders/:orderId', jwtAuth, LabTestController.getLabOrdersByPatient);
router.put('/order/reschedule', jwtAuth, validateDataEncryption(), LabTestController.rescheduleLabOrder);
router.put('/order', jwtAuth, validateDataEncryption(), LabTestController.updateLabOrder);
router.get('/list/:patientId', jwtAuth, validateDataEncryption(), LabTestController.getLabOrders);
router.delete('/cartRemove/:cartId', jwtAuth, validateDataEncryption(), LabTestController.removeCart);
router.put('/cart', jwtAuth, validateDataEncryption(), LabTestController.updateLabId);
router.get('/labDetail/:cartId', jwtAuth, validateDataEncryption(), LabTestController.getLabDetail);
router.get('/cart/sub-city-prices/:cartId', jwtAuth, validateDataEncryption(), LabTestController.getSubCityCartPrices);
router.post('/purchaseLabTest', jwtAuth, validateDataEncryption(), LabTestController.purchaseLabTest);
router.post('/purchaseLabTestMobile', jwtAuth, validateDataEncryption(), LabTestController.purchaseLabTestMobile);

router.post('/labtestnotification', jwtAuth, LabTestController.labtestNotification);
router.post('/re-schedule-lab', patientOrCareNavigator, validateDataEncryption(), LabTestController.labReschedule);

router.post('/paymentStatus', jwtAuth, validateDataEncryption(), LabTestController.paymentStatus);
// no login on the razorpay callback, the controller verifies the razorpay signature
router.post('/paymentStatusMobile',validateDataEncryption(), LabTestController.paymentStatusMobile);

router.put('/updateAddress', jwtAuth, validateDataEncryption(), LabTestController.updateAddress);
router.get('/getLabTestAddress', jwtAuth, validateDataEncryption(), LabTestController.getLabTestAddress);

// redcliff get aloc number
router.get('/getRedcliffAloc', jwtAuth, validateDataEncryption(), LabTestController.getRedcliffAloc);
router.post('/getRedcliffSlot', jwtAuth, validateDataEncryption(), LabTestController.getBookingSlot);
router.post('/createRedcliffBooking', jwtAuth, validateDataEncryption(), LabTestController.createRedcliffBooking);
router.post('/redCliffReport', verifyRedcliffWebhook, LabTestController.redCliffReport);
router.post('/fetchRedcliffReport', verifyRedcliffWebhook, LabTestController.getRedcliffReport);

router.get('/sub-cities/:cityId', jwtAuth, validateDataEncryption(),LabTestController.getSubCitiesByCityId);
router.get('/patient-company-details', jwtAuth, validateDataEncryption(),LabTestController.getPatientCompanyDetails);
router.get('/check-payment-status', jwtAuth, validateDataEncryption(),LabTestController.checkCallPaymentStatus);
router.post('/create-payment-call', jwtAuth, validateDataEncryption(),LabTestController.postPaymentCall);
router.post('/verify-call-coupon', jwtAuth, validateDataEncryption(),LabTestController.verifyCallCoupan);
router.post('/paymentStatusCallCheck', jwtAuth, validateDataEncryption(),LabTestController.paymentStatusCallCheck);

router.post('/cart/unpaid-lab-details', jwtAuth, validateDataEncryption(), LabTestController.getUnpaidLabForItem);
//router.post('/check-lab-code',validateDataEncryption(),jwtAuth, LabTestController.getLabItemWithCode);




module.exports = router;
