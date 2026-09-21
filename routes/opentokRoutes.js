const express = require('express');
const router = express.Router();
const opentokController = require('../controllers/opentokController');
const { requireAuth, ROLES } = require('../middleware/requireAuth');

/**
 * SEC-008: both routes were unauthenticated, so anyone could mint a Vonage token
 * for any sessionId and join a live teleconsultation.
 *
 * Authentication is the minimum fix. Sessions should additionally be bound to an
 * appointment record and the caller verified as a participant, rather than
 * requested by id - see docs/security/findings/SEC-008, remediation step 3.
 */
const participant = requireAuth(ROLES.PATIENT, ROLES.CARE_NAVIGATOR, ROLES.HR);

router.get('/generate-session', participant, opentokController.generateSession);
router.get('/generate-token', participant, opentokController.generateToken);

module.exports = router;
