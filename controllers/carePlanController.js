const CarePlanService = require('../services/carePlanService');
const PatientService = require('../services/patientService');
const CommonHelper = require('../helpers/commonHelper');
const { sendEmail } = require('../helpers/emailHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

const getCarePlanDetails = async (req, res) => {
    try {
        // the care plan is always for the logged in patient, the patientId query param is ignored
        const patientId = req.user.id;
        const { companyId } = req.query;
        if (!(await PatientService.isPatientConnectedToCompany(patientId, companyId))) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_403_FORBIDDEN, 'Access denied');
        }

        const carePlans = await CarePlanService.getCarePlanDetailsByCompanyId(companyId, patientId);
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { carePlans });
    } catch (error) {
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
};

module.exports = {
    getCarePlanDetails,
};
