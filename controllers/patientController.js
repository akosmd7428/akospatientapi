const jwt = require('jsonwebtoken');
const PatientService = require('../services/patientService');
const { createOrUpdatePatientSchema } = require('../validation/patientValidation'); // Adjust the path as needed
const Patient = require('../models/patientModel');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const { getFirstAndLastName } = require('../config/utils');
const { JWT_SECRET, PATIENT_FRONTEND_URL, PRESCRIPTION_LINK_SECRET } = require('../config/secret');
const AppointmentService = require('../services/appointmentService');
const Doctor = require('../models/doctorModel');
const { generatePrescription }  = require('../helpers/generatePrescription');
const PatientPrescriptionDetails = require('../models/patientPrescriptionDetails');
const CareNavigator = require('../models/careNavigatorModel');
const PatientDetail = require('../models/patientDetailModel');
const { Sequelize } = require('sequelize');
const PatientFamilyHistory = require('../models/patientFamilyHistoryModel');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const EmailTemplates = require('../helpers/emailTemplates');
class PatientController {

    static async getPatientProfileDetails(req, res) {
        try {
            const patientProfileDetails = await PatientService.getPatientProfileDetails(req.user.id);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.profileRetrieved, { patientProfileDetails });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async createOrUpdateProfile(req, res, next) {
        const { fullname, email, phone, dateofbirth, gender, city, state, zip_code, dependents } = req.body;
        const { first_name, last_name } = getFirstAndLastName(fullname);   
        // try {
            let patient;
            let errorPatient = 0;
            const { error } = createOrUpdatePatientSchema.validate(req.body);
            if (error) return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.details[0].message);

            patient = await Patient.findByPk(req.user.id);
            if (!patient) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.userNotFound);
            }
            //Update Patient Profile Details only 
            if(req.body.age != '' && req.body.age > 17){
                // email is the login identity and is read-only on the profile page, it is not changed here
                await patient.update({ first_name, last_name, phone, dateofbirth, gender, city, state, zip_code });
                await PatientService.createOrUpdatePatientProfile(req.body, req.user.id);
                await patient.update({ isProfileCompleted : true, isFirstLogin : true });
            }else{
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.patientAgeError);
            }

            // Delete existing dependents and their details
            const dependentIds = (await Patient.findAll({
                attributes: ['id'],
               where: { parent_id: req.user.id },
                raw: true
            })).map(patient => patient.id);          
           // store current dependent
           let curent_dependend_ids = [];
           if(dependents && Array.isArray(dependents) && dependents.length>0){
               for (const ddpn of dependents) {
                   let { id } = ddpn;
                   id = parseInt(id);
                   curent_dependend_ids.push(id);
               }
           }  
           /// tobe delete dependend ids
           let toBeDeleteIds = [];
           if(dependentIds && Array.isArray(dependentIds) && dependentIds.length>0){
               for (const ddpn of dependentIds) {   
                   if(!curent_dependend_ids.includes(ddpn)){                       
                       toBeDeleteIds.push(ddpn);
                   }
               }
           }
          // console.log(toBeDeleteIds);return false;
           if(toBeDeleteIds && Array.isArray(toBeDeleteIds) && toBeDeleteIds.length>0){             
                   await PatientDetail.destroy({ 
                       where: { 
                           patientId: {
                               [Sequelize.Op.in]: toBeDeleteIds
                           } 
                       } 
                   });                    
                   // Delete associated records in PatientFamilyHistory
                   await PatientFamilyHistory.destroy({ 
                       where: { 
                           patientId: {
                               [Sequelize.Op.in]: toBeDeleteIds
                           } 
                       } 
                   });                    
                //   Delete dependents in the Patient table
               await Patient.destroy({ where: { parent_id: req.user.id } });
            }
            // Delete existing dependents and their details
            // const dependentIds = (await Patient.findAll({
            //     attributes: ['id'],
            //     where: { parent_id: req.user.id },
            //     raw: true
            // })).map(patient => patient.id);
            
            // // Delete associated records in PatientDetail
            // await PatientDetail.destroy({ 
            //     where: { 
            //         patientId: {
            //             [Sequelize.Op.in]: dependentIds
            //         } 
            //     } 
            // });
            
            // // Delete associated records in PatientFamilyHistory
            // await PatientFamilyHistory.destroy({ 
            //     where: { 
            //         patientId: {
            //             [Sequelize.Op.in]: dependentIds
            //         } 
            //     } 
            // });
            
            // Delete dependents in the Patient table
            // await Patient.destroy({ where: { parent_id: req.user.id } });

            //Create or Update Dependents for Patient
            if (dependents && Array.isArray(dependents)) {
                for (const dependent of dependents) {
                let { id, fullname, email, phone, dateofbirth, gender, city, state, zip_code } = dependent;
                    if(dependent.age != '' && dependent.age > 0){
                        const { first_name, last_name } = getFirstAndLastName(fullname);   
                        if (id) {
                            // only dependents of the logged in patient can be updated
                            let existingDependent = await Patient.findOne({ where: { id, parent_id: req.user.id } });
                            if (!existingDependent) {
                                continue;
                            }
                            await existingDependent.update({ first_name, last_name, email, phone, dateofbirth, gender, city, state, zip_code });
                        } else {
                            const newDependent = await Patient.create({ first_name, last_name, email, phone, dateofbirth, gender, city, state, zip_code, parent_id: req.user.id });
                            id = newDependent.id;
                        }
                        //Handle Dependents Details and Family History
                        await PatientService.createOrUpdatePatientProfile(dependent, id, true);
                        //send email to the patient if age is 18+
                        console.log(dependent,'dependent====');
                        console.log(id,'id====');
                        
                        if(dependent.age > 17 && dependent.id != req.user.id){
                            const profileCompletionLink = `${PATIENT_FRONTEND_URL}/forgot-password?email=${dependent.email}`;
                            const { subject, html } = EmailTemplates.dependentInvite({ link: profileCompletionLink });
                            emailHelperSMTP(dependent.email, dependent.email, subject, html);
                        }
                    }else{
                        errorPatient=1;
                    }
                }
            }
            if(errorPatient == 1){ //For Patient parent
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.profileUpdatedButAgeError);
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.profileUpdated);
        // } catch (error) {
        //     CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        //     // next(error);
        // }
    }


    static async getPatientDetails(req, res) {
        const { patientEmail } = req.params;

        try {
            const patientData = await PatientService.getProfileByPatientEmail(patientEmail);
            
            if(patientData){
                if(patientData.isActive == 0 & patientData.status == 2){
                    return CommonHelper.sendError(res, STATUS_CODE.HTTP_200_OK, "This email does not exists with current company, Please connect with Akos Support", 203);
                }

                if(patientData.isActive == 0 & patientData.status == 1){
                    return CommonHelper.sendError(res, STATUS_CODE.HTTP_200_OK, "You have removed from the company, Please connect with Akos Support", 203);
                }
    
                if(patientData.isActive == 1 & patientData.status == 1){
                    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Success");
                }
            }else{
                const patient = await PatientService.getProfileByEmailId(patientEmail);
                if(patient && patient.parent_id != 0){
                    const patientDetails = await PatientService.getProfileByPatientId(patient.parent_id);

                    if(patientDetails){
                        //When it is dependent
                        if(patientDetails.isActive == 0 & patientDetails.status == 2){
                            return CommonHelper.sendError(res, STATUS_CODE.HTTP_200_OK, "This email does not exists with current company, Please connect with Akos Support", 203);
                        }
                        // when it is dependent
                        if(patientDetails.isActive == 0 & patientDetails.status == 1){
                            return CommonHelper.sendError(res, STATUS_CODE.HTTP_200_OK, "You have removed from the company, Please connect with Akos Support", 203);
                        }

                        if(patientDetails.isActive == 1 & patientDetails.status == 1){
                            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Success");
                        }
                    }
                }
            }
            const careNavigator = await CareNavigator.findOne({ where : { email : patientEmail } });
            if(careNavigator){
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "You are not authorized to logged In.");
            }else{
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No user found with the provided email.");
            }
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

   
    static async savePrescriptionDetails(req, res) {
        try {
            const { patientPrescriptionDetails, medicineDetails } = req.body;
        
            if (!patientPrescriptionDetails) {
                throw new Error("Invalid input");
            }
            // the prescribing doctor is always the logged in doctor, never the email sent in the body
            const doctor = await Doctor.findOne({ where: { id: req.user.id } });
            if (!doctor) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_403_FORBIDDEN, 'Access denied');
            }
            patientPrescriptionDetails.doctorEmail = doctor.email;
            delete patientPrescriptionDetails.id;

            const prescription = await PatientService.savePrescriptionDetail(patientPrescriptionDetails, medicineDetails, doctor.id);
            if (prescription === false) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_403_FORBIDDEN, 'Access denied');
            }
            if(prescription){
                const data = await PatientService.getPrescriptionData(prescription.id);
                await generatePrescription(data);
            }

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Success");
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    };

    static async savePrescriptionMedication(req, res) {
        try {    
            // Check if medicinePrescribed is an array and has elements
            if (!Array.isArray(req.body) || req.body.length === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Invalid input", "The 'medicinePrescribed' field must be a non-empty array.");
            }
            // Process the medicinePrescribed data
            await PatientService.savePrescriptionMedication(req.body);
            
            // Send success response
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Success", { message: "Prescription medications processed successfully." });
        } catch (error) {
            // Handle unexpected errors
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, "Server Error", error.message);
        }
    }

    static async getPrescriptionDetail(req, res) {
      try {
        let { token, cid } = req.query;
        let patientId;
        let patientDetails;
        let patientDetail;
        let doctorDetails;
        let decryptedEmail = '';
        let decryptedPatientEmail= '';
        let response = { patientDetail: {
            "email" : "support@akosmd.in",
            "phone" : "8595461929"
        }, doctorDetail: {}, prescriptionDetail: {} };
        // Decode token if provided
        if (token) {
            // token = decodeURIComponent(token);
            // for (let i = 0; i < token.length; i++) {
                // decryptedPatientEmail += String.fromCharCode(token.charCodeAt(i) ^ secretKey.charCodeAt(i % secretKey.length));
            // }
            // if(decryptedPatientEmail){
                const patientDet = await Patient.findOne({ where: { email : token } });
                if(patientDet){
                    patientId = patientDet.id;
                }
            // }
        }
        
        // Fetch patient details if patientId is available
        if (patientId) {
            patientDetails = await AppointmentService.talkToDoctorDetails(patientId);
            patientDetail = await AppointmentService.getPatientDetails(patientId);
        }
        // doctor details always come from the logged in doctor, the email query param is ignored
        {
            // email = decodeURIComponent(email);
            // for (let i = 0; i < email.length; i++) {
                // decryptedEmail += String.fromCharCode(email.charCodeAt(i) ^ secretKey.charCodeAt(i % secretKey.length));
            // }
            // if(decryptedEmail){
                const doctor = await Doctor.findOne({ where: { id: req.user.id } });
                if(!doctor){
                    throw new Error("Something went wrong!");
                }
                if (doctor) {
                    doctorDetails = await AppointmentService.fetchDoctorDetail(doctor.id);
                }
            // }
        }
        
        // Construct response based on the available data
        if (patientDetails) {
            response.patientDetail = {
                name: `${patientDetails.firstName} ${patientDetails.lastName}`,
                patientId: patientDetails.patientId,
                parent_id: patientDetails.parent_id,
                email: patientDetails.email,
                phone: patientDetails.phone,
                uuid: patientDetails.uuid,
                age: patientDetail.age,
                height: patientDetail ? patientDetail.height : undefined,
                weight: patientDetail ? patientDetail.weight : undefined,
                dateofbirth: patientDetails.dateofbirth,
                gender: patientDetails.gender,
                location: `${patientDetails.city}, ${patientDetails.state}`,
                bloodGroup: patientDetail ? patientDetail.bloodgroup : undefined
            };
        }
        
        if(cid) {
            const prescriptionDetails = await PatientService.getPrescriptionDetail(cid);
             // Extracting and mapping the required fields from the response
             if(prescriptionDetails){
                // Parse the JSON string to an object
                const parsedData = JSON.parse(prescriptionDetails.doctor_instruction);
                if(parsedData){
                    response.prescriptionDetail = {
                        callId : cid,
                        diagnosis: parsedData.progressNote.diagnosis ? parsedData.progressNote.diagnosis  : '',
                        chief_complaints: parsedData.progressNote.chiefComplaints ? parsedData.progressNote.chiefComplaints : '',
                        lab_findings: parsedData.progressNote.labs ? parsedData.progressNote.labs : '',
                        relevant_points_from_history: parsedData.progressNote.hpi ? parsedData.progressNote.hpi : ''
                    };
                }
            }
        }
        if (doctorDetails) {
            response.doctorDetail = doctorDetails;
        }
        
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { response });
      } catch (error) {
        return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
      }
    }

    static async updateProfile(req, res) {
        try {
            // a patient can only update itself, a care navigator only patients of its companies
            let patientId = req.user.id;
            if (req.user.role === 'careNavigator') {
                patientId = parseInt(req.body.patientId, 10);
                if (!patientId || !(await PatientService.isPatientInCompanies(patientId, req.careCompanyIds))) {
                    return CommonHelper.sendError(res, STATUS_CODE.HTTP_403_FORBIDDEN, 'Access denied');
                }
            }

            const patientDetail = await PatientService.updateProfile({ ...req.body, patientId });
            if(patientDetail){
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Success", { patientDetail });
            }
            throw new Error("Something went wrong!");
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    };

    static async updateNotes(req, res) {
        try {
        
            if (!req.body.notes) {
                throw new Error("Invalid input");
            }

            // notes are saved on the logged in patient, the patientId in the body is ignored
            const patientDetail = await PatientService.updateNotes({ notes: req.body.notes, patientId: req.user.id });
            if(patientDetail){
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, "Success", { patientDetail });
            }
            throw new Error("Something went wrong!");
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    };
    
    static async patientSignIn(req, res, next) {
        try {
          let userDetails;
          //Login as Patient after first time
          const patient = await Patient.findOne( { where : { id : req.user.id } } );
          if(patient) {
            userDetails = await PatientService.getPatientDetailsByEmail(patient.email, patient);
            if (userDetails.length === 0) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided token.");
            }
            userDetails.currentRole = "patient";
            const loggedBy = "careNavigator";
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { userDetails, loggedBy });          
          }else{
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "No Patient found");
          }
        } catch (error) {
          return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
}

module.exports = PatientController;