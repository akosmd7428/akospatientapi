'use strict';

/**
 * SEC-001: the `role` header is no longer read. The account kind is resolved
 * server-side from the address.
 * SEC-025: raw error.message is no longer forwarded to the client; errors
 * propagate to the terminal handler, which decides what may be shown.
 * SEC-028: responses do not vary by whether the address is registered.
 */

const ForgotPasswordService = require('../services/forgotPasswordService');
const { messages } = require('../config/language');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');

class ForgotPasswordController {
    static async sendOtp(req, res) {
        const message = await ForgotPasswordService.sendOtp(req.body.email);
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, message);
    }

    static async verifyOtp(req, res) {
        const { resetToken } = await ForgotPasswordService.verifyOtp(
            req.body.email,
            req.body.otp,
            CommonHelper.getClientIp(req)
        );
        // The reset token is returned exactly once, to the caller that proved
        // control of the mailbox. It is required by changePassword.
        return CommonHelper.sendSuccess(
            res,
            true,
            STATUS_CODE.HTTP_200_OK,
            messages.otpVerified,
            { resetToken }
        );
    }

    static async changePassword(req, res) {
        const message = await ForgotPasswordService.changePassword(
            req.body.email,
            req.body.newPassword,
            req.body.resetToken
        );
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, message);
    }
}

module.exports = ForgotPasswordController;
