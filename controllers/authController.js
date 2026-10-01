const AuthService = require('../services/authService');
const Patient = require('../models/patientModel');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');
const SsoLoginCode = require('../models/ssoLoginCode');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const CommonHelper = require('../helpers/commonHelper');
const PatientService = require('../services/patientService');
const { logError } = require('../helpers/logErrorHelper');
const errorHandler = require('../middleware/errorHandler');
const { encryptData,decryptData } = require('../config/encryption');
const DoctorService = require('../services/doctorService');
const crypto = require('crypto');
const { JWT_SECRET, PATIENT_FRONTEND_URL } = require('../config/secret');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const jwt = require('jsonwebtoken');

// how long a generated sso login code can be used
const SSO_CODE_EXPIRY_SECONDS = 300;

class AuthController {
  static async register(req, res, next) {
    try {
      const { first_name, last_name, email, password } = req.body;
      const patient = await AuthService.register({ first_name, last_name, email, password });
      return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.registrationSuccess, { patient });
    } catch (error) {
      errorHandler(error, req, res, next);
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  static async login(req, res, next) {
    try {     
      const { email, password } = req.body;
      console.log(req.body);
      const getRole = req.header("role") || null;
      let userDetails;
      //Login as Patient after first time
      let { token, user, role } = await AuthService.login({ email, password, getRole });
    
      
      if(getRole){
        if(getRole == "patient"){
          if(role == 1){
            userDetails = await PatientService.getPatientDetailsByEmail(email, user);
            if (userDetails.length === 0) {
                CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided email.");
            }
            userDetails.role = "patient";
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, userDetails });       
          }
        }
        if(getRole == "careNavigator"){
         // console.log(role,'role====');
          if(role == 2){
            userDetails = user;
            if (userDetails.length === 0) {
              CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No user found with the provided email.");
            }
            userDetails.role = "careNavigator";
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, userDetails });       
          }    
        }
        if(getRole == "hr"){
          // console.log(role,'role====');
           if(role == 3){
             userDetails = user;
             if (userDetails.length === 0) {
               CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No user found with the provided email.");
             }
             userDetails.role = "hr";
             return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, userDetails });       
           }    
         }
      }
      throw new Error("No user found");
    } catch (error) {
      errorHandler(error, req, res, next);      
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  static async encryptDataSample(req, res, next) {
    try { 
      //let EntData = encryptData(`{ "email": "nikhils@gmail.com","password": "Nikhil@akos"}`);
     // let data = `{ "email": "nikhils@gmail.com","password": "Nikhil@akos"}`;
      let data = req.body;
     // console.log(data);
     // let EntData = encryptData(data);
     // console.log(EntData);
     let EntData = data;
      return CommonHelper.sendEncryptData(res, true, STATUS_CODE.HTTP_201_CREATED, messages.registrationSuccess, { EntData });
    } catch (error) {
      errorHandler(error, req, res, next);
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  static async decryptDataSample(req, res, next) {
    try {    
      const { encryptedData,IV } = req.body;   
      //console.log(encryptedData,IV,"encrypted data")
      let result = decryptData(encryptedData,IV);    
      result = JSON.parse(result);  
      //console.log(result);
      let msgg = 'Decrypt success';
      return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.msgg, { result });
    } catch (error) {
      errorHandler(error, req, res, next);
      return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  static async getQueryStr(req, res, next) {
    try {
      
      if (Object.keys(req.params).length != 0) {
        console.log('The object is empty');
      } else {
        console.log('The object is not empty');
      }
      if(typeof req.body === undefined){
        console.log(req.body.length);
      }else{
        console.log("mm");
      } 
    
      const { encryptedData,IV } = req.body;   
      let result = decryptData(encryptedData,IV);    
      result = JSON.parse(result);    
      let msgg = 'Decrypt success';
      return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.msgg, { result });
    } catch (error) {
      errorHandler(error, req, res, next);
      return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  static async ssologin(req, res, next) {
    try {     
      const {origin_company,origin_company_address,company_name,employee_name,employee_email,employee_mobile,company_address} = req.body;
      const uuid = CommonHelper.generateUuidV4();
      //console.log("kkkk",uuid);
      if(origin_company){
        //check company and create the company
        const originalCompanyDetails = await PatientService.createOrCheckEmployee(origin_company, origin_company_address,0);       
        if(originalCompanyDetails>0){  
          const parent_id =  originalCompanyDetails;
          const companyDetails = await PatientService.createOrCheckEmployee(company_name,company_address,parent_id);
         // create emplyoyee
         const company_id = companyDetails;
         const patientDEtails = await PatientService.createOrCheckPatient(employee_name,employee_email,employee_mobile,company_id,uuid);
        }else{
          const parent_id = 0;
          const companyDetails = await PatientService.createOrCheckEmployee(company_name,company_address,parent_id);
          const company_id = companyDetails;
          const patientDEtails = await PatientService.createOrCheckPatient(employee_name,employee_email,employee_mobile,company_id,uuid);
        }
        console.log(companyDetails);
      }
     // return false;
      const getRole = req.header("role") || null;
      let userDetails;
      //Login as Patient after first time
      let { token, user, role } = await AuthService.login({ email, password, getRole });
    
      
      if(getRole){
        if(getRole == "patient"){
          if(role == 1){
            userDetails = await PatientService.getPatientDetailsByEmail(email, user);
            if (userDetails.length === 0) {
                CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided email.");
            }
            userDetails.role = "patient";
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, userDetails });       
          }
        }    
      }
      throw new Error("No user found");
    } catch (error) {
      errorHandler(error, req, res, next);      
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  // validate the credentials of an api client: client_secret, api_access and the ip whitelist
  static validateSsoClient(company, client_secret, clientIp) {
    if (!CommonHelper.secureCompare(client_secret, company.client_secret || '')) {
      return { valid: false, statusCode: STATUS_CODE.HTTP_401_UNAUTHORIZED, message: messages.sso_invalid_client_secret };
    }
    if (Number(company.api_access) !== 1) {
      return { valid: false, statusCode: STATUS_CODE.HTTP_403_FORBIDDEN, message: messages.sso_api_access_denied };
    }
    if (Number(company.api_ip_restriction) === 1 && !CommonHelper.isIpWhitelisted(clientIp, company.api_ip_whitelist)) {
      return { valid: false, statusCode: STATUS_CODE.HTTP_403_FORBIDDEN, message: messages.sso_ip_not_whitelisted };
    }
    return { valid: true };
  }

  // validate the api client and find the patient, the patient is created when it does not exist yet
  // the credentials are checked on the parent company when parent_client_id is sent
  static async resolveSsoPatient(req) {
    const { parent_client_id, client_id, client_secret, email, mobile } = req.body;
    const first_name = req.body.firstname || req.body.first_name;
    const last_name = req.body.last_name || req.body.lastname || req.body['last-name'] || '';
    const clientIp = CommonHelper.getClientIp(req);
    let company;

    if (parent_client_id) {
      // credentials belong to the parent company
      const parentCompanyDetails = await PatientService.getCompanyDetails(parent_client_id);
      if (!parentCompanyDetails[0]) {
        return { error: { statusCode: STATUS_CODE.HTTP_401_UNAUTHORIZED, message: messages.sso_invalid_parent_client } };
      }
      const parentCompany = parentCompanyDetails[0];
      const parentCheck = AuthController.validateSsoClient(parentCompany, client_secret, clientIp);
      if (!parentCheck.valid) {
        return { error: parentCheck };
      }
      // the client id is either the parent itself or one of its child companies
      if (String(client_id) === String(parent_client_id)) {
        company = parentCompany;
      } else {
        const childCompanyDetails = await PatientService.getCompanyDetailsByParent(client_id, parentCompany.id);
        if (!childCompanyDetails[0]) {
          return { error: { statusCode: STATUS_CODE.HTTP_401_UNAUTHORIZED, message: messages.sso_client_not_under_parent } };
        }
        company = childCompanyDetails[0];
      }
    } else {
      // credentials belong to the company itself
      const companyDetails = await PatientService.getCompanyDetails(client_id);
      if (!companyDetails[0]) {
        return { error: { statusCode: STATUS_CODE.HTTP_401_UNAUTHORIZED, message: messages.sso_invalid_client } };
      }
      company = companyDetails[0];
      const clientCheck = AuthController.validateSsoClient(company, client_secret, clientIp);
      if (!clientCheck.valid) {
        return { error: clientCheck };
      }
    }

    const company_id = company.id;
    let patient = await Patient.findOne({ where: { email } });

    if (patient) {
      // an existing account may only be logged in by the client it belongs to
      const connectedUser = await ConnectedCompaniesPatient.findOne({ where: { patientEmail : email, companyId : company_id } });
      if (!connectedUser && Number(patient.companyId) !== Number(company_id)) {
        return { error: { statusCode: STATUS_CODE.HTTP_403_FORBIDDEN, message: messages.sso_user_other_client } };
      }
    }

    if (!patient) {
      const uuid = CommonHelper.generateUuidV4();
      // the client owns the authentication, there is no password to log in with so a random one is stored
      const hash_password = crypto.createHash('md5').update(CommonHelper.generateUuidV4()).digest('hex');
      const createdPatientId = await PatientService.createSsoPatient(first_name, last_name, email, mobile || '', company_id, uuid, hash_password);

      if (!createdPatientId) {
        return { error: { statusCode: STATUS_CODE.HTTP_400_BAD_REQUEST, message: "Unable to create the user." } };
      }
      // assign the company doctors to the new patient
      const doctors = await DoctorService.getDoctorsByEmployer(company_id, '');
      if (doctors && doctors.length > 0) {
        await Promise.all(
          doctors.map(doctor => PatientService.assignedDoctorToPatient(doctor.id, createdPatientId))
        );
      }
      patient = await Patient.findOne({ where: { email } });
    }

    if (!patient) {
      return { error: { statusCode: STATUS_CODE.HTTP_404_NOT_FOUND, message: "No patient found with the provided email." } };
    }

    return { patient, company };
  }

  // create the login token and the patient details returned by the sso apis
  static async ssoLoginResponse(res, patient) {
    const { token } = await AuthService.patientLogin(patient);
    const userDetails = await PatientService.getPatientDetailsByEmail(patient.email, patient);
    if (userDetails.length === 0) {
      return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided email.");
    }
    userDetails.role = "patient";

    return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, userDetails });
  }

  // sso login for an api client, the login token is returned directly
  static async ssoClientLogin(req, res, next) {
    try {
      const { patient, error } = await AuthController.resolveSsoPatient(req);
      if (error) {
        return CommonHelper.sendErrorUnencrypt(res, error.statusCode, error.message);
      }
      return await AuthController.ssoLoginResponse(res, patient);
    } catch (error) {
      return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  // generate a one time sso login code for a patient, the patient portal exchanges the code for the login token
  static async ssoGenerateCode(req, res, next) {
    try {
      const { patient_id } = req.body;
      const patient = await Patient.findOne({ where: { id: patient_id } });
      if (!patient) {
        return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.sso_patient_not_found);
      }

      const code = crypto.randomBytes(32).toString('hex');
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const expiresAt = new Date(Date.now() + SSO_CODE_EXPIRY_SECONDS * 1000);
      await SsoLoginCode.create({ codeHash, patientId: patient.id, companyId: patient.companyId || 0, expiresAt });

      const login_url = `${PATIENT_FRONTEND_URL}/sso-login?code=${code}`;
      return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.sso_code_generated, { code, expires_in: SSO_CODE_EXPIRY_SECONDS, login_url });
    } catch (error) {
      return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  // exchange a one time sso code for the login token, a code can be used only once and only before it expires
  static async ssoVerifyCode(req, res, next) {
    try {
      const codeHash = crypto.createHash('sha256').update(req.body.code).digest('hex');
      const ssoCode = await SsoLoginCode.findOne({ where: { codeHash } });
      if (!ssoCode || ssoCode.usedAt || new Date(ssoCode.expiresAt) < new Date()) {
        return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_401_UNAUTHORIZED, messages.sso_invalid_code);
      }

      // mark the code as used, the usedAt check stops the same code being used by two requests at once
      const [updatedRows] = await SsoLoginCode.update({ usedAt: new Date() }, { where: { id: ssoCode.id, usedAt: null } });
      if (updatedRows !== 1) {
        return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_401_UNAUTHORIZED, messages.sso_invalid_code);
      }

      const patient = await Patient.findOne({ where: { id: ssoCode.patientId } });
      if (!patient) {
        return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided email.");
      }
      return await AuthController.ssoLoginResponse(res, patient);
    } catch (error) {
      return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  static async createUserBeforeEmailValidation(req, res, next){

       try { 
        const {employer_id,company_name,employee_name,employee_email,employee_mobile,employee_password,company_address} = req.body;
        const uuid = CommonHelper.generateUuidV4();  
        // Input string to hash
        const input = employee_password;
        // Create MD5 hash
        const hash_password = crypto.createHash('md5').update(input).digest('hex');        

        if(employer_id){
        //check company and create the company
          const companyDetails = await PatientService.getCompanyDetails(employer_id);       
          if(companyDetails[0]){              
            const company_id = companyDetails[0].id;
            const befor_email_valid = 1;     
            const is_domain_check = companyDetails[0].is_domain_check;
           // const domain_url = companyDetails[0].domain_url;
            const domainUrls = companyDetails[0].domain_url;
            const email = employee_email;
            if(is_domain_check){
              // const domain = email.split("@")[1]?.toLowerCase();
              // if (domain === domain_url) {
              //    // console.log("Valid company email");
              // } else {
              //     return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.invaliddomain);
              // }
              const domain = email.split("@")[1]?.trim().toLowerCase();
                const allowedDomains = domainUrls
                    ?.split(",")
                    .map(item => item.trim().toLowerCase())
                    .filter(Boolean);

                if (!allowedDomains?.includes(domain)) {
                    return CommonHelper.sendError(
                        res,
                        STATUS_CODE.HTTP_400_BAD_REQUEST,
                        messages.invaliddomain
                    );
                }
            }  
            const validate_token = '';
            const patientDEtails = await PatientService.createOrCheckPatient(employee_name,employee_email,employee_mobile,company_id,uuid,hash_password,company_name,company_address,befor_email_valid,validate_token);
            if(patientDEtails){
              if(patientDEtails == 1){
                  return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.user_signup);
              }
              const token = jwt.sign(
                { patientDEtails },
                  JWT_SECRET,
                { expiresIn: "1d" } // expires in 1 day
              );

              // update toen to the valid
             
          // Construct verification URL
              const verificationLink = `${PATIENT_FRONTEND_URL}/verify-email?token=${token}`; 

              const emailContent = `
              <h2>Verify Your Email Address</h2>
              <p>Hello ${employee_name},</p>
              <p>Thanks for signing up for <strong>AkosMd</strong>! Please confirm your email address by clicking the button below. This link will expire in <strong>24 hours</strong>.</p>
    
              <p><a href="${verificationLink}" class="button">Verify Email</a></p>
              <p>If you didn’t create an account, you can safely ignore this email.</p>
              <p></p>
              <p></p>
              <p>Thanks & Regards<br/>
                Akosmd India Team.
              </p>
              `;
              const msg = await emailHelperSMTP(patientDEtails, employee_email, 'Email validation', emailContent);
              return CommonHelper.sendSuccess(res,true, STATUS_CODE.HTTP_200_OK, messages.user_signup_success,{});
            }else{
               return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.user_signup, {  });
            }           
          }else{     
             return CommonHelper.sendError(res,  STATUS_CODE.HTTP_400_BAD_REQUEST, messages.unauthorize_signup);     
          }       
        
      }else{
        return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.unauthorize_signup);     
      }     
    } catch (error) {
      //errorHandler(error, req, res, next);      
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }

  }
  //verify email token
  static async verifyEmailPatient(req, res, next){
    try {     
      const token = req.query.token;
      const decoded = jwt.verify(token,JWT_SECRET);       
      if(decoded.patientDEtails){
        const patientd = decoded.patientDEtails;
        const patientDetailsData = await PatientService.getTempPatientDetails(patientd);
        // create patient or user
        if(patientDetailsData[0]){
            const befor_email_valid = 0;
            const validate_token = '';
            const employee_name = patientDetailsData[0].first_name;
            const employee_email = patientDetailsData[0].email;
            const employee_mobile = patientDetailsData[0].employee_mobile;
            const company_id = patientDetailsData[0].companyId;
            const uuid = patientDetailsData[0].uuid;
            const hash_password = patientDetailsData[0].password;
            const company_name = patientDetailsData[0].company_name;
            const company_address = patientDetailsData[0].company_address;  
            // check patient already created or not 
           
            const createdUserDetails = await PatientService.createOrCheckPatient(employee_name,employee_email,employee_mobile,company_id,uuid,hash_password,company_name,company_address,befor_email_valid,validate_token);
            await PatientService.updateStatusTempPatient(patientd);
            // create team and assigned doctor.
            if(createdUserDetails == 1){
              return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "User Already exist.");
            }
            if(createdUserDetails != 1){            
              const  employer_id  = company_id;
              const  search  = '';
              const pId = createdUserDetails;
              if(pId){
                const doctors = await DoctorService.getDoctorsByEmployer(employer_id, search);
                if (doctors && doctors.length > 0) {
                      await Promise.all(
                      doctors.map(doctor => PatientService.assignedDoctorToPatient(doctor.id,pId))
                    );
                    console.log("All doctors have been assigned to the patient successfully.");
                  }
                }
              return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.userCreated, { createdUserDetails });
            }          
        }else{
          return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Invalid user");
        }       
      }else{
         return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Invalid user");
      }
      
  } catch (error) {
    //console.error("Invalid or expired token:", err.message);
    //return null;
    return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
  }
  }

  // sign up for the external employee
  static async externalSignup(req, res, next){
     try { 
        const {employer_id,company_name,employee_name,employee_email,employee_mobile,employee_password,company_address} = req.body;
        const uuid = CommonHelper.generateUuidV4();  
        // Input string to hash
        const input = employee_password;
      // Create MD5 hash
      const hash_password = crypto.createHash('md5').update(input).digest('hex');

     // const verificationLink = CommonHelper.generateVerificationLink();
   

        if(employer_id){
        //check company and create the company
          const companyDetails = await PatientService.getCompanyDetails(employer_id);       
          if(companyDetails[0]){              
            const company_id = companyDetails[0].id;
            const befor_email_valid = 0;
            const validate_token = '';
            const patientDEtails = await PatientService.createOrCheckPatient(employee_name,employee_email,employee_mobile,company_id,uuid,hash_password,company_name,company_address,befor_email_valid,validate_token);
            if(patientDEtails == 1){

              const { employer_id } = company_id;
              const  search  = '';
              const doctors = await DoctorService.getDoctorsByEmployer(employer_id, search);

              return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.user_signup);
            }else{
               return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.userCreated, { patientDEtails });
            }
           
          }else{     
             return CommonHelper.sendError(res,  STATUS_CODE.HTTP_400_BAD_REQUEST, messages.unauthorize_signup);     
          }       
        
      }else{
        return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.unauthorize_signup);     
      }     
    } catch (error) {
      errorHandler(error, req, res, next);      
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

}

module.exports = AuthController;
