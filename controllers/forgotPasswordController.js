const ForgotPasswordService = require('../services/forgotPasswordService');
const { messages } = require('../config/language');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');
class ForgotPasswordController {
  static async sendOtp(req, res, next) {
    try {
      const role = req.header("role") || null;
      const message = await ForgotPasswordService.sendOtp(req.body.email, role);
      CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, message );
    } catch (error) {
      CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.otpError, error.message);
    }
  }

  static async verifyOtp(req, res, next) {
    try {
      const message = await ForgotPasswordService.verifyOtp(req.body.email, req.body.otp);
      CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, message);
    } catch (error) {
      CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.invalidOtp, error.message);
    }
  }

  static async changePassword(req, res, next) {
    const getRole = req.header("role") || null;
    //console.log(getRole);
    try {
      const message = await ForgotPasswordService.changePassword(req.body.email, req.body.newPassword,getRole);
      CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, message);
    } catch (error) {
      CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.passwordChangeError, error.message);
    }
  }
}

module.exports = ForgotPasswordController;
