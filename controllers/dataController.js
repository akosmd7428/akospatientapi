const DataService = require('../services/dataService');
const { assertCanAccessPatient } = require('../helpers/authorization'); // SEC-011
const { STATUS_CODE } = require('../config/constant');
const { messages } = require('../config/language');
const CommonHelper = require('../helpers/commonHelper');
const { QueryTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class DataController {
    static async getData(req, res) {
        try {
            const { type } = req.params;
            console.log(req.params);
            const data = await DataService.getAll(type);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { data });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getStates(req, res) {
        try {
            console.log("get state");
            const states = await DataService.getStates();
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { states });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
    static async getCities(req, res) {
        const { state_id } = req.query;
        try {
            if(state_id){
                const cities = await DataService.getCitiesByStateCode(state_id);
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { cities });
            }
            throw new Error("State Id is required");
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async uploadFile(req, res) {
        try {
            const { file, type } = req.body;

            // Validate input
            if (!file || !type) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "File data and type are required");
            }

            // Upload the file
            const fileUrl = await DataService.uploadFile(file, type);

            // Respond with the file URL
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.fileUploaded, { fileUrl });
            
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    static async getWaitingUserList(id, group_id) {
        // Handle the case where group_id is an array with a single element of 0
        if (group_id.length === 1 && group_id[0].id === 0) {
            const sql = `
                SELECT connect_thirdparty_url.invite_id, 
                    patientDetails.age, 
                    patientDetails.height,
                    patientDetails.weight,
                    patientDetails.profile_image,
                    patient.uniquePatientId,
                    patient.gender,
                    patient.dateofbirth,
                    patient.first_name,
                    patient.last_name,
                    patient.language_spoken,
                    patient.city,
                    patient.state,
                    patient.phone,
                    patient.email,
                    connect_waiting_room.group_id,
                    connect_waiting_room.employer_name,
                    connect_waiting_room.checked_in,
                    connect_waiting_room.patient_id,
                    connect_waiting_room.status,
                    connect_waiting_room.call_id,
                    connect_waiting_room.pcp_doctor_id,
                    connect_call_log.call_location,
                    appointments.approvedByCareNavigator,
                    appointments.id AS appointmentId,
                    doctor.speciality  
                FROM connect_waiting_room 
                JOIN connect_thirdparty_url ON connect_thirdparty_url.call_id = connect_waiting_room.call_id 
                JOIN connect_call_log ON connect_call_log.call_id = connect_waiting_room.call_id 
                JOIN doctor ON doctor.id = connect_call_log.doctor_id 
                LEFT JOIN appointments ON appointments.id = connect_call_log.appointmentId 
                JOIN patient ON patient.id = connect_waiting_room.patient_id 
                JOIN patientDetails ON patientDetails.patientId = patient.id 
                WHERE ((connect_waiting_room.group_id = 0 AND connect_waiting_room.pcp_doctor_id = :doctorId) 
                AND (connect_waiting_room.status IN ("waiting", "In progress", "PENDING", "IN CONSULTATION")) 
                AND connect_waiting_room.checked_in > DATE_SUB(NOW(), INTERVAL :hour HOUR))
            `;

            // const rows = await sequelizeDB1.query(sql, [id, 24]);
            const replacements = {
                doctorId:id,
                hour: 24
            };

            const rows = await sequelizeDB1.query(sql, {
                replacements,
                type: QueryTypes.SELECT
            });

            return rows;
        } else {            
            // Handle the case where group_id has multiple values
            const groupIds = group_id.map(group => group.id).join(",");
            
            const sql = `
                    SELECT patient.gender, 
                        patientDetails.age, 
                        patientDetails.height, 
                        patient.uniquePatientId, 
                        patientDetails.weight, 
                        patient.dateofbirth,
                        patient.first_name,
                        patient.last_name,
                        patient.email,
                        patient.city,
                        patient.state,
                        patient.phone,
                        connect_waiting_room.group_id,
                        connect_waiting_room.employer_name,
                        connect_waiting_room.checked_in,
                        connect_waiting_room.patient_id,
                        connect_waiting_room.status,
                        connect_waiting_room.call_id,
                        connect_waiting_room.pcp_doctor_id,
                        connect_provider.name,
                        connect_call_log.call_location,
                        patient_record.call_type,
                        connect_thirdparty_url.invite_id,
                        appointments.approvedByCareNavigator,
                        appointments.id AS appointmentId,
                        doctor.speciality
                    FROM connect_waiting_room 
                    JOIN connect_call_log ON connect_call_log.call_id = connect_waiting_room.call_id 
                    LEFT JOIN doctor ON doctor.id = connect_call_log.doctor_id 
                    JOIN patient ON patient.id = connect_waiting_room.patient_id 
                    LEFT JOIN connect_provider ON connect_waiting_room.pcp_doctor_id = connect_provider.id 
                    LEFT JOIN appointments ON appointments.id = connect_call_log.appointmentId 
                    JOIN patient_record ON patient_record.id = connect_waiting_room.call_id 
                    JOIN connect_thirdparty_url ON connect_thirdparty_url.call_id = connect_waiting_room.call_id 
                    JOIN patientDetails ON patientDetails.patientId = patient.id 
                    WHERE ((connect_waiting_room.group_id IN (:groupIds))
                    AND (connect_waiting_room.status IN ("waiting", "In progress", "PENDING", "IN CONSULTATION")) 
                    AND connect_waiting_room.checked_in > DATE_SUB(NOW(), INTERVAL :hour HOUR))
            `;

            // const rows = await sequelizeDB1.query(sql, [groupIds, 24]);

            const replacements = {
                groupIds,
                hour: 24
            };

            const rows = await sequelizeDB1.query(sql, {
                replacements,
                type: QueryTypes.SELECT
            });

            return rows;
        }
    }
    
    static async getTalkToDoctorCallListApi(req, res){      
        try {
            const { call_id } = req.body;
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id); // SEC-011
            const sql = `
                    SELECT patient.gender, 
                        patientDetails.age, 
                        patientDetails.height, 
                        patient.uniquePatientId, 
                        patientDetails.weight, 
                        patient.dateofbirth,
                        patient.first_name,
                        patient.last_name,
                        patient.email,
                        patient.city,
                        patient.state,
                        patient.phone,
                        connect_waiting_room.group_id,
                        connect_waiting_room.employer_name,
                        connect_waiting_room.checked_in,
                        connect_waiting_room.patient_id,
                        connect_waiting_room.status,
                        connect_waiting_room.call_id,
                        connect_waiting_room.pcp_doctor_id
                    FROM connect_waiting_room 
                    JOIN connect_call_log ON connect_call_log.call_id = connect_waiting_room.call_id 
                    JOIN patient ON patient.id = connect_waiting_room.patient_id 
                    JOIN patientDetails ON patientDetails.patientId = patient.id 
                    WHERE (connect_waiting_room.patient_id = :patientId) 
                    AND (connect_waiting_room.call_id = :call_id) 
                    AND (connect_waiting_room.status IN ("waiting", "In progress", "PENDING", "IN CONSULTATION")) 
                    AND connect_waiting_room.checked_in > DATE_SUB(NOW(), INTERVAL :hour HOUR)
            `;

            const replacements = {
                patientId,
                call_id,
                hour: 24
            };

            const rows = await sequelizeDB1.query(sql, {
                replacements,
                type: QueryTypes.SELECT
            });
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { data: rows });

        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
    static async getTalkToDoctorCallList(patientId, call_id){        
        const sql = `
                SELECT patient.gender, 
                    patientDetails.age, 
                    patientDetails.height, 
                    patient.uniquePatientId, 
                    patientDetails.weight, 
                    patient.dateofbirth,
                    patient.first_name,
                    patient.last_name,
                    patient.email,
                    patient.city,
                    patient.state,
                    patient.phone,
                    connect_waiting_room.group_id,
                    connect_waiting_room.employer_name,
                    connect_waiting_room.checked_in,
                    connect_waiting_room.patient_id,
                    connect_waiting_room.status,
                    connect_waiting_room.call_id,
                    connect_waiting_room.pcp_doctor_id
                FROM connect_waiting_room 
                JOIN connect_call_log ON connect_call_log.call_id = connect_waiting_room.call_id 
                JOIN patient ON patient.id = connect_waiting_room.patient_id 
                JOIN patientDetails ON patientDetails.patientId = patient.id 
                WHERE (connect_waiting_room.patient_id = :patientId)
                AND (connect_waiting_room.call_id = :call_id)
                AND (connect_waiting_room.status IN ("waiting","In progress", "PENDING", "IN CONSULTATION")) 
                AND connect_waiting_room.checked_in > DATE_SUB(NOW(), INTERVAL :hour HOUR)
        `;
        // "In progress",
        const replacements = {
            patientId,
            call_id,
            hour: 24
        };

        const rows = await sequelizeDB1.query(sql, {
            replacements,
            type: QueryTypes.SELECT
        });

        return rows;
    }

    static async getOpentokRoomKeys(req, res) {
        try {
            const patientId = await assertCanAccessPatient(req.user, req.query.patientId ?? req.user.id); // SEC-011
            const sql = `
                SELECT id, session, token 
                FROM connect_waiting_room 
                WHERE patient_id = :patientId
            `;

            const replacements = {
                patientId
            };

            const [rows] = await sequelizeDB1.query(sql, {
                replacements,
                type: QueryTypes.SELECT
            });

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { data: rows });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }


}

module.exports = DataController;
