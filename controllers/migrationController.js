const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const MigrationService = require('../services/migrationService');

class MigrationController {
    static async migrateLabData(req, res) {
        try {
            const payload = req.body;

            if (!payload || (Array.isArray(payload) && payload.length === 0)) {
                return CommonHelper.sendErrorUnencrypt(
                    res,
                    STATUS_CODE.HTTP_400_BAD_REQUEST,
                    'Lab payload is required'
                );
            }

            const result = await MigrationService.migrateLabsPayload(payload);
            console.error('[migrateLabData] summary:', JSON.stringify({
                labs_processed: result.labs_processed,
                labs_created: result.labs_created,
                labs_failed: result.labs_failed,
                failures: result.failures
            }));

            return CommonHelper.sendSuccessUnencrypt(
                res,
                result,
                STATUS_CODE.HTTP_200_OK,
                'Lab data migrated successfully'
            );
        } catch (error) {
            return CommonHelper.sendErrorUnencrypt(
                res,
                STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR,
                messages.serverError,
                error.message
            );
        }
    }

    static async migratePackagesData(req, res) {
        try {
            const payload = req.body;

            if (!payload || (Array.isArray(payload) && payload.length === 0)) {
                return CommonHelper.sendErrorUnencrypt(
                    res,
                    STATUS_CODE.HTTP_400_BAD_REQUEST,
                    'Package payload is required'
                );
            }

            const result = await MigrationService.migratePackagesPayload(payload);

            return CommonHelper.sendSuccessUnencrypt(
                res,
                result,
                STATUS_CODE.HTTP_200_OK,
                'Package data migrated successfully'
            );
        } catch (error) {
            return CommonHelper.sendErrorUnencrypt(
                res,
                STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR,
                messages.serverError,
                error.message
            );
        }
    }

    static async migrateDoctorData(req, res) {
        try {
            const payload = req.body;

            if (!payload || (Array.isArray(payload) && payload.length === 0)) {
                return CommonHelper.sendErrorUnencrypt(
                    res,
                    STATUS_CODE.HTTP_400_BAD_REQUEST,
                    'Doctor payload is required'
                );
            }

            const result = await MigrationService.migrateDoctorPayload(payload);

            return CommonHelper.sendSuccessUnencrypt(
                res,
                result,
                STATUS_CODE.HTTP_200_OK,
                'Doctor data migrated successfully'
            );
        } catch (error) {
            return CommonHelper.sendErrorUnencrypt(
                res,
                STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR,
                messages.serverError,
                error.message
            );
        }
    }

    static async migrateCorporateData(req, res) {
        try {
            const payload = req.body;

            if (!payload || !payload.corporate_name) {
                return CommonHelper.sendErrorUnencrypt(
                    res,
                    STATUS_CODE.HTTP_400_BAD_REQUEST,
                    'corporate_name is required in payload'
                );
            }

            const result = await MigrationService.migrateCorporatePayload(payload);

            return CommonHelper.sendSuccessUnencrypt(
                res,
                result,
                STATUS_CODE.HTTP_200_OK,
                'Corporate data migrated successfully'
            );
        } catch (error) {
            return CommonHelper.sendErrorUnencrypt(
                res,
                STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR,
                messages.serverError,
                error.message
            );
        }
    }
}

module.exports = MigrationController;
