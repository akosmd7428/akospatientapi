const HelpService = require('../services/helpService');
const CommonHelper = require('../helpers/commonHelper');
const { emailHelper } = require('../helpers/emailHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const { SEND_CONTACT_EMAIL_TO_ADMIN } = require('../config/secret');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const EmailTemplates = require('../helpers/emailTemplates');

class HelpController {
  static async getHelpFaq(req, res, next) {
    try {
      const searchQuery = req.query.q || '';
      const faqData = await HelpService.getHelpFaq(searchQuery);

      return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.faqFetched, { faqData });
    } catch (error) {
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
  }

  static async sendEmail(req, res, next) {
    try {
      const { message } = req.body;
      const { email } = req.user;

      const patient = await HelpService.getPatientDetailsByEmail(email);

      const { subject, html } = EmailTemplates.adminRequest({
          subject: 'Patient Help Request',
          intro: 'A patient has submitted a help request:',
          details: [['First Name', patient.first_name], ['Last Name', patient.last_name], ['Email', patient.email], ['Mobile', patient.phone]],
          message,
      });

      const msg = await emailHelperSMTP(req.user.id, SEND_CONTACT_EMAIL_TO_ADMIN, subject, html);

      return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, msg);
    } catch (error) {
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
  }
}

module.exports = HelpController;
