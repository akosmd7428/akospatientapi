const PatientService = require('../services/patientService');
const VitalMonitoringService = require('../services/vitalMonitoringService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const { companyPatientListSchema, ohcCreatePatientSchema } = require('../validation/patientValidation');
const {
    vitalPatientSchema,
    vitalPatientDeviceSchema,
    vitalDetailMonitoringSchema,
    postVitalMonitoringSchema,
    postDeviceCommentSchema,
} = require('../validation/vitalMonitoringValidation');

// validate the query or body, sends the 400 and returns null when it is invalid
const validateInput = (schema, input, res) => {
    const { error, value } = schema.validate(input, { abortEarly: false });
    if (error) {
        res.status(STATUS_CODE.HTTP_400_BAD_REQUEST).json({ success: false, errors: error.details.map(detail => detail.message) });
        return null;
    }
    return value;
};

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

    // create a patient of a company, 409 with the existing patient id when the email is already registered
    static async createPatient(req, res) {
        try {
            const value = validateInput(ohcCreatePatientSchema, req.body, res);
            if (!value) return;
            const result = await PatientService.createOhcPatient({
                company_id: value.company_id,
                email: value.email_id,
                phone: value.phone || null,
                date_of_birth: value.date_of_birth,
                gender: value.gender,
                first_name: value.first_name,
                last_name: value.last_name,
            });
            if (result.error === 'company_not_found') {
                return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.ohcCompanyNotFound);
            }
            if (result.error === 'email_exists') {
                return res.status(STATUS_CODE.HTTP_409_CONFLICT).json({ success: false, message: messages.ohcPatientEmailExists, patientId: result.patientId || null });
            }
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_201_CREATED, messages.ohcPatientCreated, { patient: result.patient });
        } catch (error) {
            console.error(error);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }
    }

    // active vital monitoring devices with their input fields, same data as /vital-monitoring/get-device
    static async getDevice(req, res) {
        try {
            const deviceDetails = await VitalMonitoringService.getDeviceDetails();
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { deviceDetails });
        } catch (error) {
            console.error(error);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }
    }

    // latest reading of every device of the patient
    static async getDeviceMonitoring(req, res) {
        try {
            const value = validateInput(vitalPatientSchema, req.query, res);
            if (!value) return;
            const monitoryDetails = await VitalMonitoringService.getDeviceMonitoring(value.patient_id);
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoryDetails });
        } catch (error) {
            console.error(error);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }
    }

    // save the device readings of the patient, sends the same notifications as the patient api
    static async postVitalMonitoring(req, res) {
        try {
            const value = validateInput(postVitalMonitoringSchema, req.body, res);
            if (!value) return;
            const { patient_id, deviceDetails } = value;
            // only the reading columns are taken from the request
            const flattenedFields = deviceDetails.flatMap(device =>
                device.fields.map(field => ({
                    param_key_name: field.param_key_name,
                    param_key_id: field.param_key_id ?? null,
                    param_value: field.param_value,
                    is_manual: field.is_manual ?? 1,
                    status: 1,
                    device_id: device.id,
                    patient_id,
                }))
            );
            const monitoryDetails = await VitalMonitoringService.createDeviceMonitoring(flattenedFields, patient_id);
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoryDetails });
        } catch (error) {
            console.error(error);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }
    }

    // readings of one device of the patient grouped by date, optional date range
    static async getDetailMonitoring(req, res) {
        try {
            const value = validateInput(vitalDetailMonitoringSchema, req.query, res);
            if (!value) return;
            const { patient_id, device_id, from_date = '', to_date = '' } = value;
            const monitoringData = await VitalMonitoringService.getVitalMonitoringDetails(patient_id, device_id, from_date, to_date);
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoringData });
        } catch (error) {
            console.error(error);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }
    }

    // latest comment on a device of the patient
    static async viewDeviceComment(req, res) {
        try {
            const value = validateInput(vitalPatientDeviceSchema, req.query, res);
            if (!value) return;
            const deviceComments = await VitalMonitoringService.getDeviceComment(value.patient_id, value.device_id);
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { deviceComments });
        } catch (error) {
            console.error(error);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }
    }

    // add a comment on a device of the patient
    static async postDeviceComment(req, res) {
        try {
            const value = validateInput(postDeviceCommentSchema, req.body, res);
            if (!value) return;
            const { patient_id, device_id, comment, created_by, user_type } = value;
            const deviceComments = await VitalMonitoringService.postDeviceComment({ patient_id, device_id, comment, created_by, user_type, status: 1 });
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { deviceComments });
        } catch (error) {
            console.error(error);
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }
    }
}

module.exports = OhcSyncController;
