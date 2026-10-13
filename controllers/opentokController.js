const opentokService = require('../services/opentokService');
const { messages } = require('../config/language');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');
const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');

// a session belongs to a talk to doctor call in connect_waiting_room, the caller must be part of that call:
// the patient itself, a doctor of the call's connect provider, or a care navigator of the patient's company
const isSessionParticipant = async (user, sessionId, careCompanyIds) => {
    let query;
    const replacements = { sessionId };
    if (user.role === 'patient') {
        query = 'SELECT cwr.id FROM connect_waiting_room cwr WHERE cwr.session = :sessionId AND cwr.patient_id = :userId LIMIT 1';
        replacements.userId = user.id;
    } else if (user.role === 'doctor') {
        query = `SELECT cwr.id FROM connect_waiting_room cwr
                 JOIN connect_provider cp ON cp.id = cwr.pcp_doctor_id
                 WHERE cwr.session = :sessionId AND (cp.doctor_id = :userId OR cp.email = :email) LIMIT 1`;
        replacements.userId = user.id;
        replacements.email = user.email || '';
    } else if (user.role === 'careNavigator') {
        query = `SELECT cwr.id FROM connect_waiting_room cwr
                 JOIN patient p ON p.id = cwr.patient_id
                 WHERE cwr.session = :sessionId AND p.employer_id IN (:careCompanyIds) LIMIT 1`;
        replacements.careCompanyIds = careCompanyIds;
    } else {
        return false;
    }
    const [row] = await sequelizeDB1.query(query, { replacements, type: QueryTypes.SELECT });
    return !!row;
};

const generateSession = async (req, res) => {
    try {
    const sessionId = await opentokService.createSession();
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { sessionId:sessionId});
    } catch (error) {
    return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
};

const generateToken = async (req, res) => {
  try {
  const sessionId = req.query.sessionId;
  const role = req.query.role || 'publisher'; // Default role is 'publisher'
  const data = req.query.data || ''; // Optional data

  if (!sessionId || typeof sessionId !== 'string') {
    return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Session ID is required");
  }

  // tokens only for sessions of calls the caller takes part in
  if (!await isSessionParticipant(req.user, sessionId, req.careCompanyIds)) {
    return CommonHelper.sendError(res, STATUS_CODE.HTTP_403_FORBIDDEN, "Access denied");
  }

  const token = opentokService.generateToken(sessionId, role, data);
    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { token:token});
  } catch (error) {
    return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
  }
};


module.exports = {
  generateSession,
  generateToken
};
