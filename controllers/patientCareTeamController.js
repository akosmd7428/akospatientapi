const PatientCareTeamService = require('../services/patientCareTeamService');
const { sendError, sendSuccess } = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');
const { messages } = require('../config/language');

class PatientCareTeamController {
    static async addDoctors(req, res) {
        try {
            const patientId = req.user.id;
            const doctorIds = req.body.doctorIds;

            const data = doctorIds.map(doctorId => ({ patientId, doctorId }));

            const result = await PatientCareTeamService.addDoctorsToCareTeam(data, patientId);
            
            return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.doctorsAdded, { result });
        } catch (error) {
            return sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getCareTeam(req, res) {
        try {
            const patientId = req.user.id;
            const { search } = req.query;

            const result = await PatientCareTeamService.getCareTeam(patientId, search);
            
            return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.careTeamFetched, { result });
        } catch (error) {
            return sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
}

module.exports = PatientCareTeamController;
