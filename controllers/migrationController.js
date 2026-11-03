const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const MigrationService = require('../services/migrationService');

// one sync call may carry at most this many records (top level array, or data/doctors/packages/labs/diagnostics/employees)
const MAX_MIGRATION_RECORDS = parseInt(process.env.MAX_MIGRATION_RECORDS, 10) || 5000;
const RECORD_LIST_KEYS = ['data', 'doctors', 'packages', 'labs', 'diagnostics', 'employees'];

const tooManyRecords = (payload) => {
    if (Array.isArray(payload)) return payload.length > MAX_MIGRATION_RECORDS;
    if (!payload || typeof payload !== 'object') return false;
    return RECORD_LIST_KEYS.some(key => Array.isArray(payload[key]) && payload[key].length > MAX_MIGRATION_RECORDS);
};

const sendTooManyRecords = (res) => CommonHelper.sendErrorUnencrypt(
    res,
    STATUS_CODE.HTTP_400_BAD_REQUEST,
    `Too many records, at most ${MAX_MIGRATION_RECORDS} per request`
);

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
            if (tooManyRecords(payload)) return sendTooManyRecords(res);

            const result = await MigrationService.migrateLabsPayload(payload);
            console.log('[migrateLabData] summary:', JSON.stringify({
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
            console.log('migrateLabData error:', error);
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
            if (tooManyRecords(payload)) return sendTooManyRecords(res);

            const result = await MigrationService.migratePackagesPayload(payload);

            return CommonHelper.sendSuccessUnencrypt(
                res,
                result,
                STATUS_CODE.HTTP_200_OK,
                'Package data migrated successfully'
            );
        } catch (error) {
            console.log('migratePackagesData error:', error);
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
            if (tooManyRecords(payload)) return sendTooManyRecords(res);

            const result = await MigrationService.migrateDoctorPayload(payload);

            return CommonHelper.sendSuccessUnencrypt(
                res,
                result,
                STATUS_CODE.HTTP_200_OK,
                'Doctor data migrated successfully'
            );
        } catch (error) {
            console.log('migrateDoctorData error:', error);
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
            if (tooManyRecords(payload)) return sendTooManyRecords(res);

            const result = await MigrationService.migrateCorporatePayload(payload);

            return CommonHelper.sendSuccessUnencrypt(
                res,
                result,
                STATUS_CODE.HTTP_200_OK,
                'Corporate data migrated successfully'
            );
        } catch (error) {
            console.log('migrateCorporateData error:', error);
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
