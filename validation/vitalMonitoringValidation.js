const Joi = require('joi');

// vital monitoring apis for the ohc backend (sync), the patient comes in the request

const patientId = Joi.number().integer().positive().required();
const deviceId = Joi.number().integer().positive().required();

const vitalPatientSchema = Joi.object({
    patient_id: patientId,
});

const vitalPatientDeviceSchema = Joi.object({
    patient_id: patientId,
    device_id: deviceId,
});

// from_date and to_date are YYYY-MM-DD, both or none
const vitalDetailMonitoringSchema = Joi.object({
    patient_id: patientId,
    device_id: deviceId,
    from_date: Joi.date().iso().raw().allow('').optional(),
    to_date: Joi.date().iso().raw().allow('').optional(),
}).and('from_date', 'to_date');

// readings of the devices, same body as /vital-monitoring/post-vital-monitoring
const postVitalMonitoringSchema = Joi.object({
    patient_id: patientId,
    deviceDetails: Joi.array().min(1).max(50).items(Joi.object({
        id: deviceId,
        fields: Joi.array().min(1).max(50).items(Joi.object({
            param_key_name: Joi.string().trim().max(100).required(),
            param_key_id: Joi.number().integer().allow(null).optional(),
            param_value: Joi.alternatives().try(Joi.number(), Joi.string().trim().max(50)).required(),
            is_manual: Joi.number().integer().valid(0, 1).optional(),
        }).unknown(true)).required(),
    }).unknown(true)).required(),
});

const postDeviceCommentSchema = Joi.object({
    patient_id: patientId,
    device_id: deviceId,
    comment: Joi.string().trim().max(5000).required(),
    created_by: Joi.number().integer().positive().required(),
    user_type: Joi.number().integer().required(),
});

module.exports = {
    vitalPatientSchema,
    vitalPatientDeviceSchema,
    vitalDetailMonitoringSchema,
    postVitalMonitoringSchema,
    postDeviceCommentSchema,
};
