const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const CareNavigator = require('../models/careNavigatorModel');
const Patient = require('../models/patientModel');
const AppointmentService = require('../services/appointmentService');
const PatientService = require('../services/patientService');
const { APPOINTMENT_STATUS, SEND_CONTACT_EMAIL_TO_ADMIN } = require('../config/secret');
const labTestService = require('../services/labTestService');
const HelpService = require('../services/helpService');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const AuthService = require('../services/authService');
const Prescription = require('../models/prescription');
const PatientFolder = require('../models/patientFoldersModel');
const Doctor = require('../models/doctorModel');
const PatientFile = require('../models/patientFileModel');
const PreEmployeePatientService = require('../services/PreEmployeePatientService');

class CareNavigatorController {

    static async getProfileDetails(req, res) {
        try {
            const userDetails = await CareNavigator.findByPk(req.user.id);
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
            const careCompanyIds = req.user.companyIds; // SEC-009: from the signed token, not a header
           
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
                        const secretKey = "8D3f7c1A9bE4xT2zLwQ5mR8oNpV6yJ1";
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
            const updatedAppointment = await AppointmentService.rescheduleAppointment(appointmentId, date, time);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentReschedule, { updatedAppointment });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async cancelAppointment(req, res) {
        try {
            const { appointmentId } = req.body;
            const updatedAppointment = await AppointmentService.cancelAppointment(appointmentId);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentCancelled, { updatedAppointment });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async approveAppointment(req, res) {
        try {
            const { appointmentId } = req.body;
            const updatedAppointment = await AppointmentService.approveAppointment(appointmentId);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentApproved, { updatedAppointment });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateAppointment(req, res) {
        try {
            const { appointmentId, status } = req.body;
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
            const careCompanyIds = req.user.companyIds; // SEC-009: from the signed token, not a header
            const userDetails = await PatientService.getAllPatients(search, filter,careCompanyIds);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.patientDetailsFetched, { userDetails });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getMyPatients(req, res) {
        try {
            const { search, filter } = req.query;
            const careCompanyIds = req.user.companyIds; // SEC-009: from the signed token, not a header
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
            const careCompanyIds = req.user.companyIds; // SEC-009: from the signed token, not a header
            const labTests = await labTestService.getLabOrdersForCareNavigator(status, search, filter,careCompanyIds);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.patientDetailsFetched, { labTests });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async dashboard(req, res) {
        try {
            const careCompanyIds = req.user.companyIds; // SEC-009: from the signed token, not a header
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
            const careCompanyIds = req.user.companyIds; // SEC-009: from the signed token, not a header
            const prescriptions = await labTestService.getPrescriptionUploaded(careCompanyIds);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { prescriptions });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async updateLabOrder(req, res) {

        const { orderId, status } = req.body;
        // try {
            const updateData = {
                "orderStatus": status
            }
            const result = await labTestService.updateLabOrder(orderId, updateData);
            if (result[0] === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND,messages.labOrderNotFound );
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.labOrderUpdated, { result });
        // } catch (error) {
        //     return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        // }
    }

    static async uploadLabReport(req, res) {

        const { orderId, labReportURL } = req.body;
        try {
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
            const { email } = req.user;

            const careNavigator = await HelpService.getCareNavigatorDetailsByEmail(email);

            const emailContent = `
            <p>Care Navigator Details:</p>
            <p><strong>Name:</strong> ${careNavigator.name}</p>
            <p><strong>Email:</strong> ${careNavigator.email}</p>
            <p><strong>Mobile:</strong> ${careNavigator.phone}</p>
            <p><strong>Message:</strong> ${message}</p>
            `;

            const msg = await emailHelperSMTP(req.user.id, SEND_CONTACT_EMAIL_TO_ADMIN, 'Care Navigator Help Request', emailContent);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, msg);
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getLabOrdersByPatient(req, res) {
        try {
            const { orderId } = req.params;
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
          //Login as Patient after first time
          const patient = await Patient.findOne( { where : { id : patientId } } );
          if(patient) {
            let { token } = await AuthService.patientLogin(patient);
            userDetails = await PatientService.getPatientDetailsByEmail(patient.email, patient);
            if (userDetails.length === 0) {
                CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided patient Id.");
            }
            userDetails.currentRole = "patient";
            const loggedBy = "careNavigator";
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, userDetails, loggedBy });          
          }else{
            throw new Error("Invalid Patient Id");
          }
        } catch (error) {
          console.error(error);
          return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
        }
    }

    
    static async uploadPrescription(req, res, next) {
        try {
        const { patientId, doctorId, appointmentId, prescriptionURL } = req.body;
        const prescriptionUniqueId = Math.floor(10000 + Math.random() * 90000);
        //write code to upload prescription
        if(patientId && doctorId && appointmentId && prescriptionURL){

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
            console.log(patient,'patient===');
            if(patient){
                await emailHelperSMTP(null, patient.email, 'Prescription Received', `<p>Hi ${patient.first_name} ${patient.last_name}, <br/></br>Your prescription is now available for download. <a href="${prescriptionURL}">Click here</a> to access your prescription. If you have any questions or need further assistance, please contact our support team at +91-8595461929.<br/><br/>Thank you!<br/>Team AkosMD</p>`); 
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.prescriptionUpload); 
        }
        else{
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "All fields are required");
        } 
        } catch (error) {
            console.error(error);
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
        }             
    }
    // get lab status for pre employee
    static async getPreEmpLabTests(req, res) {
        try {
            const { status, search, filter,companyId } = req.query;
            const careCompanyIds = req.user.companyIds; // SEC-009: from the signed token, not a header
            const labTests = await PreEmployeePatientService.getPreEmploymentBookingDetails(companyId,status, search, filter,careCompanyIds);
            return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.patientDetailsFetched, { labTests });
        } catch (error) {
            CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

     // update report
     static async updateLabPreLabReport(req, res) {
        const {  status, report_url, id,report_remark } = req.body;
        console.log(id);
         try {
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