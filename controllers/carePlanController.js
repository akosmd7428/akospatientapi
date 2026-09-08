const CarePlanService = require('../services/carePlanService');
const CommonHelper = require('../helpers/commonHelper');
const { sendEmail } = require('../helpers/emailHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

const getCarePlanDetails = async (req, res) => {
    try {
        const { companyId, patientId } = req.query;

        const carePlans = await CarePlanService.getCarePlanDetailsByCompanyId(companyId, patientId);
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { carePlans });
    } catch (error) {
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
};

module.exports = {
    getCarePlanDetails,
};
