const AcrossAssistService = require('../services/acrossAssistService');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');
const { messages } = require('../config/language');

const HTTP_502_BAD_GATEWAY = 502;

class AcrossAssistController {
    // forward the appointment confirmation to Across Assist and return its answer
    static async sendAppointmentConfirmation(req, res) {
        try {
            // const result = await AcrossAssistService.sendAppointmentConfirmation(req.body);
            // logged in webhook_logs as source "manual" with the logged in user
            const result = await AcrossAssistService.sendAppointmentConfirmation(req.body, {
                source: 'manual',
                event: 'manual',
                referenceId: req.body.appointment_id,
                patientId: req.user && req.selectedPatientId,
            });
            if (!result.ok) {
                return CommonHelper.sendError(res, HTTP_502_BAD_GATEWAY, 'Across Assist appointment confirmation failed', [{
                    partner_status: result.status,
                    partner_response: result.data,
                    error: result.error || null,
                }]);
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, 'Appointment confirmation sent', {
                partner_status: result.status,
                partner_response: result.data,
            });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
}

module.exports = AcrossAssistController;
