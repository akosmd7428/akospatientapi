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
            const { patient_id } = req.query;
            //console.log(patient_id);
            const monitoryDetails = await VitalMonitoringService.getDeviceMonitoring(patient_id);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoryDetails });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
    static async postVitalMonitoring(req, res) {
        try {
           
            const { patient_id, deviceDetails} = req.body;
            
            const flattenedFields = deviceDetails.flatMap(device =>
                device.fields.map(field => ({
                    ...field,
                    device_id: device.id,
                    patient_id: patient_id
                }))
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
            const { patient_id, device_id, from_date, to_date} = req.query;
           
            const monitoringData = await VitalMonitoringService.getVitalMonitoringDetails(patient_id, device_id, from_date, to_date);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoringData });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }   
    static async getDetailMonitoring(req, res) {
        try {           
            const { patient_id, device_id, from_date, to_date} = req.query;           
            const monitoringData = await VitalMonitoringService.getVitalMonitoringDetails(patient_id, device_id, from_date, to_date);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { monitoringData });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // get device comment 
    static async viewDeviceComment(req, res){
        try{
            const { patient_id, device_id} = req.query;           
            const deviceComments = await VitalMonitoringService.getDeviceComment(patient_id, device_id);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { deviceComments });
        }catch(error){
             return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // post device comment
    static async postDeviceComment(req, res){
         try{
            const  post_details = req.body;        
            //console.log(post_details);
            const deviceComments = await VitalMonitoringService.postDeviceComment(post_details);            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.vitalDeviceFetched, { deviceComments });
        }catch(error){
             return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
}

module.exports = VitalMonitoringController;
