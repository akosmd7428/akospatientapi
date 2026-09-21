const express = require('express');
const { requireAuth, ROLES } = require('../middleware/requireAuth'); // SEC-001
const LabTestController = require('../controllers/labTestController');
const validateSchema = require('../middleware/validateSchema');
const { addToCartSchema } = require('../validation/cartValidator');
const { uploadPrescriptionSchema } = require('../validation/prescriptionValidator');
// SEC-027: this previously destructured `labOrderValidation`, a name the module
// does not export, so the value was undefined and never used - leaving POST
// /order with no validation at all (SEC-013).
const { createLabOrderSchema } = require('../validation/labOrderValidation');
const syncApiKeyAuth = require('../middleware/syncApiKeyAuth');
const  validateDataEncryption  = require('../middleware/validateDataEncryption');
const router = express.Router();

router.get('/packages-and-tests',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getPackagesAndTests);
router.post('/upload',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(uploadPrescriptionSchema), LabTestController.uploadPrescription);
router.post('/addToCart',requireAuth(ROLES.PATIENT), validateDataEncryption(), validateSchema(addToCartSchema), LabTestController.addToCart);
router.get('/cities',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getAllActiveCities);
router.post('/cart/details',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getCartDetailsByPatientId);
router.post('/cart/lab-details',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getLabDetailsByCart);
router.post('/branches',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getBranchesByLabAndCity);
router.post('/tests-and-packages',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getTestsAndPackagesByLab);
router.post('/test-or-package-details',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getTestOrPackageDetails);
router.delete('/remove/:cartId',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.removeCartItem);
router.get('/prescription/:patientId',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getPrescriptionUrl);
router.delete('/prescription/:prescriptionId', requireAuth(ROLES.PATIENT), LabTestController.deletePrescription);
router.post('/order',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.createLabOrder);
router.get('/orders/:orderId', requireAuth(ROLES.PATIENT), LabTestController.getLabOrdersByPatient);
// SEC-008: both were unauthenticated - any lab order could be modified, and any
// patient's order list read, by anyone.
router.put('/order',requireAuth(ROLES.CARE_NAVIGATOR, ROLES.HR), validateDataEncryption(), LabTestController.updateLabOrder);
router.get('/list/:patientId',requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR), validateDataEncryption(), LabTestController.getLabOrders);
router.delete('/cartRemove/:cartId',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.removeCart);
router.put('/cart',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.updateLabId);
router.get('/labDetail/:cartId',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getLabDetail);
router.post('/purchaseLabTest',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.purchaseLabTest);
router.post('/purchaseLabTestMobile',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.purchaseLabTestMobile);

router.post('/labtestnotification', requireAuth(ROLES.PATIENT), LabTestController.labtestNotification);
router.post('/re-schedule-lab',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.labReschedule);

router.post('/paymentStatus',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.paymentStatus);
// SEC-008: was unauthenticated (and applied validateDataEncryption twice).
router.post('/paymentStatusMobile',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.paymentStatusMobile);

router.put('/updateAddress',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.updateAddress);
router.get('/getLabTestAddress',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getLabTestAddress);

/**
 * SEC-008: the Redcliff lab integration routes were all unauthenticated.
 *
 * The first three are called by our own clients, so they take a user session.
 *
 * redCliffReport and fetchRedcliffReport look like provider callbacks, which
 * cannot carry a user token. They are authenticated with the shared-secret
 * middleware instead - the same one migrationRoutes already uses correctly.
 * If Redcliff supports request signing, prefer that; see SEC-008 step 4.
 */
router.get('/getRedcliffAloc',requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR), validateDataEncryption(), LabTestController.getRedcliffAloc);
router.post('/getRedcliffSlot',requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR), validateDataEncryption(), LabTestController.getBookingSlot);
router.post('/createRedcliffBooking',requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR), validateDataEncryption(), LabTestController.createRedcliffBooking);
router.post('/redCliffReport', syncApiKeyAuth, LabTestController.redCliffReport);
router.post('/fetchRedcliffReport', syncApiKeyAuth, LabTestController.getRedcliffReport);

router.get('/check-payment-status',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.checkCallPaymentStatus);
router.post('/create-payment-call',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.postPaymentCall);
router.post('/verify-call-coupon',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.verifyCallCoupan);
router.post('/paymentStatusCallCheck',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.paymentStatusCallCheck);

router.post('/cart/unpaid-lab-details',requireAuth(ROLES.PATIENT), validateDataEncryption(), LabTestController.getUnpaidLabForItem);
//router.post('/check-lab-code',validateDataEncryption(),requireAuth(ROLES.PATIENT), LabTestController.getLabItemWithCode);




module.exports = router;
