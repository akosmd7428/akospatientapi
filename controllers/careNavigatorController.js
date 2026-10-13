const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const CareNavigator = require('../models/careNavigatorModel');
const Patient = require('../models/patientModel');
const AppointmentService = require('../services/appointmentService');
const PatientService = require('../services/patientService');
const { APPOINTMENT_STATUS, SEND_CONTACT_EMAIL_TO_ADMIN, PRESCRIPTION_LINK_SECRET } = require('../config/secret');
const labTestService = require('../services/labTestService');
const HelpService = require('../services/helpService');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const EmailTemplates = require('../helpers/emailTemplates');
const AuthService = require('../services/authService');
const Prescription = require('../models/prescription');
const PatientFolder = require('../models/patientFoldersModel');
const Doctor = require('../models/doctorModel');
const PatientFile = require('../models/patientFileModel');
const PreEmployeePatientService = require('../services/PreEmployeePatientService');
const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');

const toId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

// a patient belongs to the care navigator when its employer is one of req.careCompanyIds
const patientInScope = async (patientId, careCompanyIds) => {
    const id = toId(patientId);
    if (!id) return false;
    const [row] = await sequelizeDB1.query(
        'SELECT id FROM patient WHERE id = :id AND employer_id IN (:careCompanyIds) LIMIT 1',
        { replacements: { id, careCompanyIds }, type: QueryTypes.SELECT }
    );
    return !!row;
};

// returns the appointment when its patient is in the care navigator's companies
const appointmentInScope = async (appointmentId, careCompanyIds) => {
    const id = toId(appointmentId);
    if (!id) return null;
    const [row] = await sequelizeDB1.query(
        `SELECT a.id, a.patientId, a.doctorId FROM appointments a JOIN patient p ON p.id = a.patientId
         WHERE a.id = :id AND (p.employer_id IN (:careCompanyIds) OR p.companyId IN (:careCompanyIds)) LIMIT 1`,
        { replacements: { id, careCompanyIds }, type: QueryTypes.SELECT }
    );
    return row || null;
};

const labOrderInScope = async (orderId, careCompanyIds) => {
    const id = toId(orderId);
    if (!id) return false;
    const [row] = await sequelizeDB1.query(
        `SELECT lo.id FROM labOrders lo JOIN patient p ON p.id = lo.patientId
         WHERE lo.id = :id AND (p.employer_id IN (:careCompanyIds) OR p.companyId IN (:careCompanyIds)) LIMIT 1`,
        { replacements: { id, careCompanyIds }, type: QueryTypes.SELECT }
    );
    return !!row;
};

class CareNavigatorController {

    static async getProfileDetails(req, res) {
        try {
            const userDetails = await CareNavigator.findByPk(req.user.id, { attributes: { exclude: ['password'] } });
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.careNavigatorRetrieved, { userDetails });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async createOrUpdateProfile(req, res, next) {
        const { name, email, phone, gender, age, profilePic } = req.body;
        try {
            let careNavigator;
            careNavigator = await CareNavigator.findByPk(req.user.id);
            if (!careNavigator) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.userNotFound);
            }
            //Update Profile Details
            if(req.body.age != '' && req.body.age > 18){
                await careNavigator.update({ name, phone, gender, age, profilePic });
            }else{
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.careNavigatorAgeError);
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.careNavigatorProfileUpdated);
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getAppointments(req, res, next) {
        try {
            const { search, status, filter } = req.query;
            const careCompanyIds = req.careCompanyIds;
           
            const appointments = await AppointmentService.getAppointmentsForCareNavigator(status, search, filter,careCompanyIds);
    
            if (appointments.length === 0) {
               // return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.noAppointmentsFound);   
               const appointmentssta =  [];            
                 return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK,messages.noAppointmentsFound, { appointmentssta  });
            }
    
            // Process each appointment asynchronously
            const validAppointments = await Promise.all(appointments.map(async (appointment) => {
                const { appointmentId, patientId, doctorEmail, doctorName, patientName, date, time, isConfirmed, call_started, call_ended, status, prescriptionURL, profilePic, doctorId } = appointment;
                const dateTime = new Date(`${date} ${time}`).toLocaleString('en-US', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true
                });
            
                let callDuration = null;
                let appointmentStatus = APPOINTMENT_STATUS.CANCELLED;
                let prescription = prescriptionURL;
            
                // Completed Case
                if (status == 2 && call_started && call_ended) {
                    const durationMs = new Date(call_ended) - new Date(call_started);
                    const durationSec = durationMs / 1000; // Convert to seconds
                    callDuration = new Date(durationMs).toISOString().substr(11, 8); // HH:mm:ss
                    appointmentStatus = APPOINTMENT_STATUS.COMPLETED;
                    if (prescription == null) {
                        const secretKey = PRESCRIPTION_LINK_SECRET;
                        const xorEncrypt = (text, key) => {
                            let encrypted = '';
                            for (let i = 0; i < text.length; i++) {
                                encrypted += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
                            }
                            return encodeURIComponent(encrypted);
                        };
                        prescription = "https://prescription.akosmd.in/?email=" + xorEncrypt(doctorEmail, secretKey);
                    }
                    if (callDuration && durationSec > 10) {
                        return {
                            patientId,
                            appointmentId,
                            doctorName,
                            patientName,
                            date,
                            time,
                            dateTime,
                            callDuration,
                            prescriptionURL: prescription,
                            appointmentStatus,
                            profilePic,
                            doctorId,
                        };
                    }
                }
            
                // Upcoming Case
                if (status == 1) {
                    appointmentStatus = APPOINTMENT_STATUS.UPCOMING;
                    const now = new Date();
                    const appointmentDateTime = new Date(`${date} ${time}`);
                    const timeDiff = appointmentDateTime - now; // Difference in milliseconds
                    const joinNow = timeDiff > 0 & timeDiff <= 300000 ? 1 : 0;
            
                    return {
                        patientId,
                        appointmentId,
                        doctorName,
                        patientName,
                        dateTime,
                        date,
                        time,
                        isConfirmed,
                        appointmentStatus,
                        profilePic,
                        doctorId,
                        joinNow,
                    };
                }
            
                // Cancelled Case
                if (status == 3) {
                    return {
                        patientId,
                        appointmentId,
                        doctorName,
                        patientName,
                        dateTime,
                        date,
                        time,
                        appointmentStatus,
                        profilePic,
                        doctorId,
                    };
                }
            
                // Skip this iteration
                return null;
            }));
            
            // Filter out null values
            const formattedAppointments = validAppointments.filter(appointment => appointment !== null);           
    
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentFetched, { formattedAppointments });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async rescheduleAppointment(req, res) {
        try {
            const { appointmentId, date, time } = req.body;
            if (!await appointmentInScope(appointmentId, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "Appointment not found");
            }
            const updatedAppointment = await AppointmentService.rescheduleAppointment(appointmentId, date, time);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentReschedule, { updatedAppointment });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async cancelAppointment(req, res) {
        try {
            const { appointmentId } = req.body;
            if (!await appointmentInScope(appointmentId, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "Appointment not found");
            }
            const updatedAppointment = await AppointmentService.cancelAppointment(appointmentId);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentCancelled, { updatedAppointment });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async approveAppointment(req, res) {
        try {
            const { appointmentId } = req.body;
            if (!await appointmentInScope(appointmentId, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "Appointment not found");
            }
            const updatedAppointment = await AppointmentService.approveAppointment(appointmentId);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentApproved, { updatedAppointment });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateAppointment(req, res) {
        try {
            const { appointmentId, status } = req.body;
            if (!await appointmentInScope(appointmentId, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "Appointment not found");
            }
            const updatedAppointment = await AppointmentService.updateAppointment(appointmentId, status, req.user.id);
            if(status == 1){
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentApproved, { updatedAppointment });
            }else{
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentCancelled, { updatedAppointment });
            }
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
    static async getAllPatients(req, res) {
        try {
            const { search, filter } = req.query;
            const careCompanyIds = req.careCompanyIds;
            const userDetails = await PatientService.getAllPatients(search, filter,careCompanyIds);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.patientDetailsFetched, { userDetails });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getMyPatients(req, res) {
        try {
            const { search, filter } = req.query;
            const careCompanyIds = req.careCompanyIds;
            //Update count to zero 
            await CareNavigator.update(
                { totalAssignedPatient: 0 },
                { where: { id: req.user.id } }
            );
            const userDetails = await PatientService.getMyPatients(search, filter,careCompanyIds);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.patientDetailsFetched, { userDetails });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getLabTests(req, res) {
        try {
            const { status, search, filter } = req.query;
            const careCompanyIds = req.careCompanyIds;
            const labTests = await labTestService.getLabOrdersForCareNavigator(status, search, filter,careCompanyIds);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.patientDetailsFetched, { labTests });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async dashboard(req, res) {
        try {
            const careCompanyIds = req.careCompanyIds;
            let totalAssignedPatient = 0;
            const appointments = await AppointmentService.getAppointmentsForDashboard(1,careCompanyIds);
            // Process each appointment asynchronously
            const formattedAppointments = await Promise.all(appointments.map(async (appointment) => {
                const { appointmentId, patientName, date, time, isConfirmed, status } = appointment;    
                // Upcoming Case
                if (status == 1) {
                   const appointmentStatus = APPOINTMENT_STATUS.UPCOMING;
                    return {
                        appointmentId,
                        patientName,
                        date,
                        time,
                        isConfirmed,
                        appointmentStatus,
                    };
                }
            }));

            const labTests = await labTestService.getLabOrdersForDashboard(careCompanyIds);
            const totalPatientCount = await PatientService.getPatientCount(careCompanyIds);
            const totalMyPatientCount = await PatientService.getMyPatientCount(careCompanyIds);
            const careNavigator = await CareNavigator.findOne({ where: { id: req.user.id }});
            if(careNavigator){
                totalAssignedPatient = careNavigator.totalAssignedPatient;
            }
            const data = {
                "appointments" : formattedAppointments,
                "labTests" : labTests,
                "totalPatientCount" : totalPatientCount,
                "totalMyPatientCount" : totalMyPatientCount,
                "totalAssignedPatient" : totalAssignedPatient,
                "chatCount" : 0,
                "rpmCount" : 0
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, data );
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }


    static async prescriptions(req, res) {
        try {
            const careCompanyIds = req.careCompanyIds;
            const prescriptions = await labTestService.getPrescriptionUploaded(careCompanyIds);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { prescriptions });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateLabOrder(req, res) {

        const { orderId, status, labId, labCityId, subCityId, labBranchId } = req.body;
        try {
            if (!await labOrderInScope(orderId, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.labOrderNotFound);
            }
            const updateData = {
                "orderStatus": status
            }
            // remember who approved, so the patient can no longer reschedule it themselves
            if (status === 'confirmed') {
                updateData.approvedBy = req.user.id;
            }
            // sub city orders are booked without a lab; care navigator assigns lab, city, sub city and branch on approval
            if (labId && status === 'confirmed') {
                const cities = await labTestService.getAllActiveCities();
                const city = cities.find(item => Number(item.id) === Number(labCityId));
                if (!city) {
                    return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Selected city is not available");
                }
                const allowedLabs = await labTestService.getLabsForOrderPackages(orderId, labCityId);
                const lab = allowedLabs.find(item => Number(item.labId) === Number(labId));
                if (!lab) {
                    return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Selected lab is not available for this package in this city");
                }
                if (!lab.branches.some(item => Number(item.id) === Number(labBranchId))) {
                    return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Selected branch does not belong to this lab and city");
                }
                if (subCityId) {
                    const subCities = await labTestService.getSubCitiesByCityId(labCityId);
                    if (!subCities.some(item => Number(item.id) === Number(subCityId))) {
                        return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Selected sub city does not belong to this city");
                    }
                }
                updateData.labId = labId;
                updateData.labCityName = city.cityName;
                updateData.subCityId = subCityId || null;
                updateData.labBranchId = labBranchId;
            }
            // shown as "Cancelled by" in the care navigator cancellation email
            let cancelledBy;
            if (status === 'cancelled') {
                const careNavigator = await CareNavigator.findByPk(req.user.id, { attributes: ['name'] }).catch(() => null);
                cancelledBy = careNavigator?.name ? `Care Navigator (${careNavigator.name})` : 'Care Navigator';
            }
            const result = await labTestService.updateLabOrder(orderId, updateData, undefined, { cancelledBy });
            if (result[0] === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.labOrderUpdated, { result });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getOrderLabs(req, res) {
        try {
            const orderId = parseInt(req.params.orderId, 10);
            if (!orderId || orderId < 1) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Valid orderId is required");
            }
            if (!await labOrderInScope(orderId, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.labOrderNotFound);
            }
            // labs are listed for the requested city, or the order's own city by default
            const location = await labTestService.getOrderLocation(orderId);
            const labCityId = parseInt(req.query.labCityId, 10) || location?.labCityId || null;
            const labs = labCityId ? await labTestService.getLabsForOrderPackages(orderId, labCityId) : [];
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, {
                labs,
                labCityId,
                labCityName: location?.labCityName || null,
                subCityId: location?.subCityId || null,
                labBranchId: location?.labBranchId || null
            });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getLabCities(req, res) {
        try {
            const cities = await labTestService.getAllActiveCities();
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { cities });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getSubCities(req, res) {
        try {
            const cityId = parseInt(req.params.cityId, 10);
            if (!cityId || cityId < 1) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Valid cityId is required");
            }
            const subCities = await labTestService.getSubCitiesByCityId(cityId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { subCities });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async uploadLabReport(req, res) {

        const { orderId, labReportURL } = req.body;
        try {
            if (!await labOrderInScope(orderId, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.labOrderNotFound);
            }
            const updateData = {
                "labReportURL": labReportURL
            }
            const result = await labTestService.updateLabOrder(orderId, updateData);
            if (result[0] === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.labOrderUpdated, { result });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getPackages(req, res) {
        try {
            const packages = await PatientService.getPackages();
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { packages });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async sendEmail(req, res, next) {
        try {
            const { message } = req.body;
            // message ends up html-escaped in the admin email, only accept plain text of sane length
            if (typeof message !== 'string' || !message.trim() || message.length > 5000) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Valid message is required");
            }

            // sender is the logged in care navigator
            const careNavigator = await CareNavigator.findByPk(req.user.id, { attributes: ['name', 'email', 'phone'] });
            if (!careNavigator) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.userNotFound);
            }

            const { subject, html } = EmailTemplates.adminRequest({
                subject: 'Care Navigator Help Request',
                intro: 'A care navigator has submitted a help request:',
                details: [['Name', careNavigator.name], ['Email', careNavigator.email], ['Mobile', careNavigator.phone]],
                message,
            });

            const msg = await emailHelperSMTP(req.user.id, SEND_CONTACT_EMAIL_TO_ADMIN, subject, html);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, msg);
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getLabOrdersByPatient(req, res) {
        try {
            const { orderId } = req.params;
            if (!await labOrderInScope(orderId, req.careCompanyIds)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.labOrderNotFound);
            }
            const labOrders = await labTestService.getLabOrdersByPatientId(orderId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.ordersFetched, { labOrders });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async login(req, res, next) {
        try {
          const { patientId } = req.body;
          let userDetails;
          // a care navigator can only sign in as a patient of its own companies
          if (!await patientInScope(patientId, req.careCompanyIds)) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided patient Id.");
          }
          //Login as Patient after first time
          const patient = await Patient.findOne( { where : { id : patientId } } );
          if(patient) {
            userDetails = await PatientService.getPatientDetailsByEmail(patient.email, patient);
            if (!userDetails || userDetails.length === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided patient Id.");
            }
            // plain patient token, same as a normal patient login
            let { token } = await AuthService.patientLogin(patient);
            userDetails.currentRole = "patient";
            const loggedBy = "careNavigator";
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, userDetails, loggedBy });          
          }else{
            throw new Error("Invalid Patient Id");
          }
        } catch (error) {
          console.error(error);
          return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Invalid Patient Id");
        }
    }

    
    static async uploadPrescription(req, res, next) {
        try {
        const { patientId, appointmentId, prescriptionURL } = req.body;
        const prescriptionUniqueId = Math.floor(10000 + Math.random() * 90000);
        //write code to upload prescription
        if(patientId && req.body.doctorId && appointmentId && prescriptionURL){
            // the appointment must be this patient's and the patient in the care navigator's companies
            const appointment = await appointmentInScope(appointmentId, req.careCompanyIds);
            if (!appointment || Number(appointment.patientId) !== Number(patientId)) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "Appointment not found");
            }
            // doctor comes from the appointment, not from the request
            const doctorId = appointment.doctorId;

            const data = {
                "prescriptionURL" : prescriptionURL,
                "prescriptionId" : prescriptionUniqueId,
                "doctor_id" : doctorId,
                "appointmentId" : appointmentId
            };
            // Create new records in bulk
            await Prescription.create(data);
            let folderExists;
            if(patientId != 0){
                folderExists = await PatientFolder.findOne({ where: { folderName : "Prescriptions", patientId: patientId } });
                if(!folderExists){
                    const patientFolder = {
                        "patientId" : patientId,
                        "folderName" : 'Prescriptions',
                        "folderType" : 1
                    };
                    folderExists = await PatientFolder.create(patientFolder);
                }
                const doctorid =  doctorId;
                const doctorDetails = await Doctor.findOne({ where: { id: doctorid } });
                if(doctorDetails){
                    const patientFile = {
                        "patientId" : patientId,
                        "folderId" : folderExists.id,
                        "fileName" : `${doctorDetails.name}_${new Date().toISOString().split('T')[0]}`,
                        "fileType" : 1,
                        "fileUrl" : prescriptionURL,
                        "status" : 1
                    };
                    await PatientFile.create(patientFile);   
                }
            }
            const patient = await Patient.findOne({where: { id: patientId} }); 
            if(patient){
                await emailHelperSMTP(null, patient.email, ...Object.values(EmailTemplates.prescriptionReady({ name: `${patient.first_name} ${patient.last_name}`, link: prescriptionURL }))); 
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.prescriptionUpload); 
        }
        else{
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "All fields are required");
        } 
        } catch (error) {
            console.error(error);
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }             
    }
    // get lab status for pre employee
    static async getPreEmpLabTests(req, res) {
        try {
            const { status, search, filter } = req.query;
            const careCompanyIds = req.careCompanyIds;
            const labTests = await PreEmployeePatientService.getPreEmploymentBookingDetails(null,status, search, filter,careCompanyIds);
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.patientDetailsFetched, { labTests });
        } catch (error) {
            CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

     // update report
     static async updateLabPreLabReport(req, res) {
        const {  status, report_url, id,report_remark } = req.body;
         try {
            // pre employee must belong to one of the care navigator's companies
            const preEmployee = await PreEmployeePatientService.getPreEmployeeInCompanies(id, req.careCompanyIds);
            if (!preEmployee) {
                return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.labOrderNotFound);
            }
            const updateData = {
                "isActive": status                 
            }
            if(report_url){
                updateData.report_url = report_url;
            }
            if(report_remark){
                updateData.report_remark = report_remark;
            }
            const result = await PreEmployeePatientService.updatePreLabReport(id, updateData);
            if (result[0] === 0) {
                return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
            }
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.labOrderUpdated, { result });
         } catch (error) {
            console.log(error);
             return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
         }
    }    
}

module.exports = CareNavigatorController;