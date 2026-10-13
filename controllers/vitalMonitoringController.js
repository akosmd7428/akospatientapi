const VitalMonitoringService = require('../services/vitalMonitoringService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');


class VitalMonitoringController {   

    static async getDevice(req, res) {
        try {
           // const { role, referenceId, filter = 'all' } = req.query;
            const deviceDetails = await VitalMonitoringService.getDeviceDetails();            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { deviceDetails });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

     static async getDeviceMonitoring(req, res) {
        try {
            // the logged in patient's readings only, patient_id from the query is ignored
            const patient_id = req.user.id;
            const monitoryDetails = await VitalMonitoringService.getDeviceMonitoring(patient_id);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoryDetails });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
    static async postVitalMonitoring(req, res) {
        try {
           
            const { deviceDetails } = req.body;
            const patient_id = req.user.id;
            if (!Array.isArray(deviceDetails)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, 'deviceDetails is required');
            }

            // only the reading columns are taken from the client, never id/createdAt/patient
            const READING_FIELDS = ['param_key_id', 'param_key_name', 'param_value', 'status', 'is_manual'];
            const flattenedFields = deviceDetails.flatMap(device =>
                (Array.isArray(device && device.fields) ? device.fields : []).map(field => {
                    const reading = {};
                    READING_FIELDS.forEach(key => {
                        if (field && field[key] !== undefined) reading[key] = field[key];
                    });
                    return {
                        ...reading,
                        device_id: device.id,
                        patient_id: patient_id
                    };
                })
            );
    
            const monitoryDetails = await VitalMonitoringService.createDeviceMonitoring(flattenedFields,patient_id);
            // sending notification to user                          
           // const sendingNotification = await VitalMonitoringService.sendingNotificationToUser(flattenedFields);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoryDetails });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getDetailMonitoring(req, res) {
        try {           
            const { device_id, from_date, to_date} = req.query;
            const patient_id = req.user.id;
           
            const monitoringData = await VitalMonitoringService.getVitalMonitoringDetails(patient_id, device_id, from_date, to_date);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoringData });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }   
    static async getDetailMonitoring(req, res) {
        try {           
            const { device_id, from_date, to_date} = req.query;
            const patient_id = req.user.id;
            const monitoringData = await VitalMonitoringService.getVitalMonitoringDetails(patient_id, device_id, from_date, to_date);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoringData });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // get device comment 
    static async viewDeviceComment(req, res){
        try{
            const { device_id} = req.query;
            const patient_id = req.user.id;
            const deviceComments = await VitalMonitoringService.getDeviceComment(patient_id, device_id);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { deviceComments });
        }catch(error){
             return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // post device comment
    static async postDeviceComment(req, res){
         try{
            const { device_id, comment, created_by, user_type } = req.body;
            // the comment is always attached to the logged in patient, id/status/patient_id from the client are ignored
            const post_details = { device_id, comment, created_by, user_type, patient_id: req.user.id };
            const deviceComments = await VitalMonitoringService.postDeviceComment(post_details);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { deviceComments });
        }catch(error){
             return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
}

module.exports = VitalMonitoringController;
