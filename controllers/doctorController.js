const DoctorService = require('../services/doctorService');
const { STATUS_CODE } = require('../config/constant');
const { messages } = require('../config/language');
const CommonHelper = require('../helpers/commonHelper');

class DoctorController {
    static async getDoctors(req, res) {
        try {
            const { employer_id } = req.params;
            const { search } = req.query;
            const doctors = await DoctorService.getDoctorsByEmployer(employer_id, search);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.doctorsFetched, { doctors });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getDoctorAvailability(req, res) {
        try {
            const { doctorId } = req.params;
            const availability = await DoctorService.getDoctorAvailability(doctorId);

            return CommonHelper.sendSuccess(
                res,
                true,
                STATUS_CODE.HTTP_200_OK,
                messages.dataFetched,
                { availability }
            );
        } catch (error) {
            return CommonHelper.sendError(
                res,
                STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR,
                messages.serverError,
                error.message
            );
        }
    }
}

module.exports = DoctorController;
