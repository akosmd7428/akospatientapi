const express = require('express');
const router = express.Router();
const OhcSyncController = require('../controllers/ohcSyncController');
const syncApiKeyAuth = require('../middleware/syncApiKeyAuth');

// server to server apis for the ohc backend, plain json (not encrypted), the sync api key is required
router.get('/company-patients', syncApiKeyAuth, OhcSyncController.getCompanyPatients);
router.post('/create-patient', syncApiKeyAuth, OhcSyncController.createPatient);

// vital monitoring, same as /vital-monitoring but the patient_id comes in the request
router.get('/get-device', syncApiKeyAuth, OhcSyncController.getDevice);
router.get('/get-device-monitoring', syncApiKeyAuth, OhcSyncController.getDeviceMonitoring);
router.post('/post-vital-monitoring', syncApiKeyAuth, OhcSyncController.postVitalMonitoring);
router.get('/get-detail-monitoring', syncApiKeyAuth, OhcSyncController.getDetailMonitoring);
router.get('/view-device-comment', syncApiKeyAuth, OhcSyncController.viewDeviceComment);
router.post('/post-device-comment', syncApiKeyAuth, OhcSyncController.postDeviceComment);

// call events for ohc patients, the same functions as the socket events incomingCallTalkToDoctor / declinefromPatient
router.post('/incoming-call-talk-to-doctor', syncApiKeyAuth, OhcSyncController.incomingCallTalkToDoctor);
router.post('/decline-from-patient', syncApiKeyAuth, OhcSyncController.declinefromPatient);

// talk to doctor call made from the ohc portal for a company patient: call data, connect-api token and
// one time code (the connect-api calls are made by the ohc browser like the patient app), accepted doctor
router.get('/talk-to-doctor', syncApiKeyAuth, OhcSyncController.talkToDoctor);
router.post('/connect-code', syncApiKeyAuth, OhcSyncController.connectCode);
router.post('/connect-token', syncApiKeyAuth, OhcSyncController.connectToken);
router.get('/call-status', syncApiKeyAuth, OhcSyncController.callStatus);
// socket token for the ohc portal browser: joins the socket as the patient, call events only
router.post('/socket-token', syncApiKeyAuth, OhcSyncController.socketToken);
// chat file of the call (sent on the socket as a messageType 2 message)
router.post('/chat-upload', syncApiKeyAuth, OhcSyncController.chatUpload);

module.exports = router;
