const PortalModuleService = require('../services/portalModuleService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

class PortalModuleController {
    // active portal modules for the logged-in patient's company
    static async getActiveModules(req, res) {
        try {
            const modules = await PortalModuleService.getActiveModulesForPatient(req.selectedPatientId);
            // return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { modules });
            const company_settings = await PortalModuleService.getCompanySettingsForPatient(req.selectedPatientId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { modules, company_settings });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
}

module.exports = PortalModuleController;
