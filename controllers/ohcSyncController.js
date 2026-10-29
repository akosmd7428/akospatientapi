const PatientService = require('../services/patientService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const { companyPatientListSchema } = require('../validation/patientValidation');

class OhcSyncController {
    // patient lookup of a company for the ohc backend: id, name and email, search by patient name or email
    static async getCompanyPatients(req, res) {
        try {
            const { error, value } = companyPatientListSchema.validate(req.query, { abortEarly: false });
            if (error) {
                return res.status(STATUS_CODE.HTTP_400_BAD_REQUEST).json({ success: false, errors: error.details.map(detail => detail.message) });
            }
            const { companyId, search } = value;
            const patients = await PatientService.getCompanyPatients(companyId, search);

            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.companyPatientsFetched, { patients });
        } catch (error) {
            console.error(error);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }
    }
}

module.exports = OhcSyncController;
