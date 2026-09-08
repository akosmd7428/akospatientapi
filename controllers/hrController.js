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
const Hr = require('../models/hrModel');
const PreEmployeePatient = require('../models/preEmployeePatientModel');
const PreEmployeePatientService = require('../services/PreEmployeePatientService');
const { v4: uuidv4 } = require('uuid');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
class HrController {

    static async getProfileDetails(req, res) {
        try {           
            const userDetails = await Hr.findByPk(req.user.id);
            console.log(userDetails);
            const userProfileData = userDetails?
            {   
                id: userDetails.id,
                name: userDetails.name,
                email: userDetails.email,
                phone: userDetails.phone,
                gender: userDetails.gender,
                age: userDetails.age,
                dateofbirth: userDetails.dateofbirth,
                zip_code: userDetails.zip_code,
                companyId: userDetails.companyId,
                profilePic: userDetails.profilePic,

            }:{};
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.profileFetched, { userProfileData });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    static async createOrUpdateProfile(req, res, next) {
        const { name, email, phone, gender, age, profilePic,id } = req.body;
        try {       
           let HrDetails = await Hr.findByPk(req.user.id);
            if (!HrDetails) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.userNotFound);
            }
            //Update Profile Details
            if(req.body.age != '' && req.body.age > 18){
                await HrDetails.update({ name, phone, gender, age, profilePic });
            }else{
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.hrAgeError);
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.hrProfileUpdated);
        } catch (error) {
           // console.log(error);
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // create employee
    static async createPreEmployee(req, res){
       // console.log(req.body);      
        const { name, email, phone, gender, age, dateofbirth,city, state, zip_code,companyId,type,health_check_up_date } = req.body;
        const companyId_header= req.header('companyId');
        try {          
            const data = {
                "name" : name,
                "email" : email,
                "phone" : phone,
                "gender" : gender,
                "age" : age,
                "dateofbirth":dateofbirth,
                "city":city,
                "state":state,
                "zip_code":zip_code,
                "health_check_up_date":health_check_up_date,
                //'currentLocation':currentLocation,
                'companyId':companyId_header,
                'isActive':3,
                'type' : type
            };
           // console.log(data);
            // Create new records in bulk
           let empCreated =  await PreEmployeePatient.create(data);        
            //Update Profile Details
            if(empCreated.id == ''){
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.preEmpCreateErr);
            }else{
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.preEmpCreate);
            }           
        } catch (error) {       
            //console.log(error); 
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // get patient list
    static async getListOfPreEmployee(req, res){
        try {
            const companyId_header= req.header('companyId');
            const { companyId,status,search,from_date,to_date } = req.query;      
            const userDetails = await PreEmployeePatientService.getPreEmployeeList(companyId_header,status,search); 
            const preEnroll = await PreEmployeePatientService.getStatusWisePreEnroll(companyId_header,from_date,to_date);
            const anual= await PreEmployeePatientService.getStatusWiseAnual(companyId_header,from_date,to_date); 
            const statusWise = {
                preEnroll:preEnroll,
                anual:anual
            }
            const data = {
                userDetails:userDetails,              
                statusWise:statusWise

            }         
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.preEmpRetrieved, { data });
        } catch (error) {          
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getCompanyHraAssesment(req, res){
        try {
            const { companyId,year,search } = req.query;          
            const companyId_header= req.header('companyId');
            const hraDetaails = await PreEmployeePatientService.getHraAssessment(companyId_header,year,search); 
            const pendingHra = await PreEmployeePatientService.getEmpPendingHra(companyId_header,year,search);
            const empMonthWise = await PreEmployeePatientService.getMonthWise(companyId_header,year,search);
            const data = {
                hraDetaails: hraDetaails,
                pendingHra : pendingHra,
                empMonthWise:empMonthWise             
            }  
            //console.log(data);     
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.preEmpRetrieved, { data });
        } catch (error) {
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    // get umber of employees who take call to doctors
    static async getEmpTookCall(req, res){
        try{
            const {companyId,from_date,to_date} = req.query;
            const companyId_header= req.header('companyId');
            const noOfEmpTakenCall = await PreEmployeePatientService.getNoOfEmployeeTakenCall(companyId_header,from_date,to_date);
            const speciallityWise = await PreEmployeePatientService.getEmpCountBySpeciality(companyId_header,from_date,to_date);
            const data = {
                noOfEmpTakenCall: noOfEmpTakenCall,   
                speciallityWise:speciallityWise                       
            }  
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.noOfEmp, { data });
        }catch(error){
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message); 
        }
    }
    static async sendReminder(req, res, next){
        try {
            const  message  = 'please take hra assesment.';
            const { email } = req.query;        
            const preEmployer = await PatientService.getProfileByEmailId(email);
            console.log(preEmployer);
            const emailContent = `
            <p>Care Navigator Details:</p>
            <p><strong>Name:</strong> ${preEmployer.first_name} ${preEmployer.last_name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Mobile:</strong> ${preEmployer.phone}</p>
            <p><strong>Message:</strong> ${message}</p>            `;
            const msg = await emailHelperSMTP(req.user.id, SEND_CONTACT_EMAIL_TO_ADMIN, 'HRA assesment avail', emailContent);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, msg);
        } catch (error) {
            console.log(error);
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
    // static async sendEmail(req, res, next) {
    //     try {
    //         const { message } = req.body;
    //         const { email } = req.user;

    //         const careNavigator = await HelpService.getCareNavigatorDetailsByEmail(email);

    //         const emailContent = `
    //         <p>Care Navigator Details:</p>
    //         <p><strong>Name:</strong> ${careNavigator.name}</p>
    //         <p><strong>Email:</strong> ${careNavigator.email}</p>
    //         <p><strong>Mobile:</strong> ${careNavigator.phone}</p>
    //         <p><strong>Message:</strong> ${message}</p>
    //         `;

    //         const msg = await emailHelperSMTP(req.user.id, SEND_CONTACT_EMAIL_TO_ADMIN, 'Care Navigator Help Request', emailContent);

    //         return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, msg);
    //     } catch (error) {
    //         return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    //     }
    // }

    // cardio records
    static async getCardioRecords(req, res, next) {
        try {
            const { companyId,from_date, to_date } = req.query;    
            const companyId_header= req.header('companyId');
            const cardioResult = await PreEmployeePatientService.getPatientCountForCardio(companyId_header,from_date,to_date);
            const hyperResult = await PreEmployeePatientService.getPatientCountForHyper(companyId_header,from_date,to_date);
            const daibeticsResult = await PreEmployeePatientService.getPatientCountForDaibetics(companyId_header,from_date,to_date);
            const data = {
                cardioResult:cardioResult,
                hyperResult:hyperResult,
                daibeticsResult:daibeticsResult
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.noOfEmp, { data });
        }catch(error){
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message); 
        }
    }
    // akos employee details
    static async getEmployeeDetails(req, res, next){
        try {
            const { companyId,search, filter,status } = req.query;    
            const companyId_header= req.header('companyId');
            const employeeNewlyAdded = await PreEmployeePatientService.getEmployeeNewAdded(companyId_header);
            const employeeDisabled = await PreEmployeePatientService.getEmployeeDisable(companyId_header);
            const employeeInSystem = await PreEmployeePatientService.getEmployeeInSystem(companyId_header);
            const empDetails = await PreEmployeePatientService.getEmployeeDetails(companyId_header,search,filter,status);
          //  console.log('dis',employeeDisabled);
            const employeeStatus = {
                employeeNewlyAdded:employeeNewlyAdded,
                employeeDisabled:employeeDisabled,
                employeeInSystem:employeeInSystem,
                empDetails:empDetails
            }
            const data = {
                employeeStatus:employeeStatus,
               
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.noOfEmp, { employeeStatus });
        }catch(error){
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message); 
        }
    }
    // update employee status
    static async updateEmployeeStatus(req, res, next){
        try {
            const { companyId,patientId,status } = req.body;  
            const companyId_header= req.header('companyId');
            const employeest = await PreEmployeePatientService.enableDisableEmployeeStatus(companyId_header,patientId,status);
            const statusUpdate = {
                statusUpdate : true
            }

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.statusUpdateEmp, { statusUpdate });
        }catch(error){
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message); 
        }
    }

    static async createEmployeesPatient(req, res){
        // console.log(req.body);
         const { name, email, phone, gender, age, dateofbirth,city, state, zip_code,companyId } = req.body;
          try {  
            const companyId_header= req.header('companyId');
            // find patient email exist or not     
            const  password = 'Akosmd@123';
            //const hashedPassword = await bcrypt.hash(password, 10);
            const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
            let patientEmail = email;
            console.log(email);
            const patientEmailExt = await Patient.findOne({ where: { email } });
            console.log(patientEmailExt);
            if(patientEmailExt != null){ 
                CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.serverError, 'Email is already registered.');
            }else{
                const PatientData = {
                    "connectionType" : 1,
                    "first_name" : name,                   
                    "companyId" :companyId_header,
                    "dateofbirth" : dateofbirth,
                    "gender" : gender,
                    "city":city,
                    "state":state,
                    "zip_code":zip_code,
                    "phone":phone,
                    "employer_id":companyId_header,
                    "email":email,
                    "password":hashedPassword    
                 }
                // Create new records in bulk
                let empCreated =  await Patient.create(PatientData);     
               // console.log(empCreated.id);
               // return false;
                if(empCreated.id == ''){
                    // connected patient profile entry                     
                    return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.preEmpCreateErr);
                 }else{
                    const empId = empCreated.id;
                    const randNumber = Math.floor(100000 + Math.random() * 900000);
                    const connectPatientData = {
                        "connectionType" : 1,
                        "first_name" : name,
                        "patientEmail" : email,
                        "companyId" :companyId_header,
                        "dob" : dateofbirth,
                        "gender" : gender,
                        "city_id":city,
                        "state_id":state,
                        "zip_code":zip_code,
                        "mobile_no":phone,
                        "patientId":empId,
                        "password":hashedPassword,
                        "uniquePatientId": randNumber,
                        "status":1        
                     }
                     await ConnectedCompaniesPatient.create(connectPatientData);                       
                     return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.preEmpCreate);
                 } 
            }         
                      
         } catch (error) {       
            // console.log(error); 
             CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
         }
     }
    // engagement
    static async engagementOfEmployee(req, res){
        try {
            const { companyId,from_date,to_date } = req.query;  
            const companyId_header= req.header('companyId');
            const totalemp = await PreEmployeePatientService.totalemp(companyId_header,from_date,to_date);

            const empCallTaken = await PreEmployeePatientService.takenpatientcall(companyId_header,from_date,to_date);
            const assesmentTaken = await PreEmployeePatientService.takenassesment(companyId_header,from_date,to_date);
            const labBookTaken = await PreEmployeePatientService.takenLabBooking(companyId_header,from_date,to_date);

            let serviceTaken = parseInt(empCallTaken) + parseInt(assesmentTaken) + parseInt(labBookTaken);
            let notTake = totalemp - serviceTaken;

            let recuring = {
                                call_taken : empCallTaken,
                                assesment_taken : assesmentTaken,
                                lab_book_taken : labBookTaken
                         }

            const resultArray = Object.keys(recuring).map(key => ({
                name: key,
                count: recuring[key]
            }));
            // get unique records
            const empCallTakenUnique = await PreEmployeePatientService.takenpatientcallUnique(companyId_header);
            const assesmentTakenUnique = await PreEmployeePatientService.takenassesmentUnique(companyId_header);
            const labBookTakenUnique = await PreEmployeePatientService.takenLabBookingUnique(companyId_header);

            let unique = {
                call_taken : empCallTakenUnique,
                assesment_taken : assesmentTakenUnique,
                lab_book_taken : labBookTakenUnique
            }

            const resultArrayqinque = Object.keys(unique).map(key => ({
                name: key,
                count: unique[key]
            }));
            
            const servicedetails = {
                total : totalemp,
                notTaken : notTake,
                recurring : resultArray,
                unique : resultArrayqinque
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.hrRecord, { servicedetails });
        }catch(error){
            CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message); 
        }
    }
      

    static async prescriptions(req, res) {
        try {
            const prescriptions = await labTestService.getPrescriptionUploaded();
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

    static async sendEmailhr(req, res, next) {
        try {
            const { message,email } = req.body;
           // const { email } = req.user;
            console.log(email);
            const hrdetails = await HelpService.getHrDetailsByEmail(email);

            const emailContent = `
            <p>Care Navigator Details:</p>
            <p><strong>Name:</strong> ${hrdetails.name}</p>
            <p><strong>Email:</strong> ${hrdetails.email}</p>
            <p><strong>Mobile:</strong> ${hrdetails.phone}</p>
            <p><strong>Message:</strong> ${message}</p>
            `;

            const msg = await emailHelperSMTP(req.user.id, SEND_CONTACT_EMAIL_TO_ADMIN, 'HR Help Request', emailContent);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, msg);
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    } 

    // get hr module
     static async getUserModule(req, res, next) {
        try {        
        const userModuleinfo = await PreEmployeePatientService.getUserModule(req.query.id);
         const userCompanyInfo = await PreEmployeePatientService.getUserComanies(req.query.id);
         const data = {userModuleinfo, userCompanyInfo}
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { data });
    } catch (error) {
        return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
    }
    
}

module.exports = HrController;