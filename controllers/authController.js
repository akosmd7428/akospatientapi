const AuthService = require('../services/authService');
const Patient = require('../models/patientModel');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const CommonHelper = require('../helpers/commonHelper');
const PatientService = require('../services/patientService');
const { logError } = require('../helpers/logErrorHelper');
const errorHandler = require('../middleware/errorHandler');
const DoctorService = require('../services/doctorService');
const crypto = require('crypto');
const { PATIENT_FRONTEND_URL } = require('../config/secret');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const { hashPassword } = require('../helpers/passwordHelper');
const { issueEmailToken, verifyEmailToken } = require('../helpers/tokenHelper');

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
      // SEC-016: this previously logged req.body here. validateDataEncryption has
      // already decrypted it by this point, so it printed the plaintext email and
      // password of every login attempt to the process log.
      const getRole = req.header("role") || null;
      let userDetails;
      // The role selects which table to check. It is not an authorization
      // decision - the password must still match - and the issued token's role
      // comes from the server, not from this header (SEC-001).
      let { token, refreshToken, user, role } = await AuthService.login(
        { email, password, getRole },
        CommonHelper.getClientIp(req)
      );
    
      
      if(getRole){
        if(getRole == "patient"){
          if(role == 1){
            userDetails = await PatientService.getPatientDetailsByEmail(email, user);
            if (userDetails.length === 0) {
                CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided email.");
            }
            userDetails.role = "patient";
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, refreshToken, userDetails });       
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
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, refreshToken, userDetails });       
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
             return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, refreshToken, userDetails });       
           }    
         }
      }
      throw new Error("No user found");
    } catch (error) {
      errorHandler(error, req, res, next);      
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  /**
   * SEC-017: exchange a refresh token for a new access token. Refresh tokens are
   * single use; replaying a revoked one is treated as a compromised family and
   * terminates every session for that user.
   */
  static async refresh(req, res) {
    const result = await AuthService.refresh(
      req.body.refreshToken,
      CommonHelper.getClientIp(req)
    );
    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, result);
  }

  /** SEC-017: there was no logout at all, so a session could not be terminated. */
  static async logout(req, res) {
    await AuthService.logout(req.user);
    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, 'Logged out');
  }

  static async logoutAll(req, res) {
    await AuthService.logoutAll(req.user);
    return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, 'Logged out of all sessions');
  }

  // SEC-005: encryptDataSample, decryptDataSample and getQueryStr were removed.
  // They were unauthenticated and took attacker-supplied input: two decrypted
  // arbitrary ciphertext with the server's key and returned the plaintext, the
  // third encrypted arbitrary data with it. Together they meant the payload
  // cipher offered no protection even with a secret key, because the server
  // would encrypt and decrypt on demand - which is also why rotating the key in
  // SEC-004 would have achieved nothing while they existed.
  //
  // If a tool for crafting payloads is needed, it belongs outside the deployed
  // application, run locally against a development key.

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
        // SEC-016: removed a console.log of the company row.
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
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, refreshToken, userDetails });       
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

  // sso login for an api client, the credentials are checked on the parent company when parent_client_id is sent
  static async ssoClientLogin(req, res, next) {
    try {
      const { parent_client_id, client_id, client_secret, email, mobile } = req.body;
      const first_name = req.body.firstname || req.body.first_name;
      const last_name = req.body.last_name || req.body.lastname || req.body['last-name'] || '';
      const clientIp = CommonHelper.getClientIp(req);
      // SEC-016: removed a console.log of client_secret, which printed the SSO
      // client secret in cleartext on every authentication attempt.
      let company;

      if (parent_client_id) {
        // credentials belong to the parent company
        const parentCompanyDetails = await PatientService.getCompanyDetails(parent_client_id);
        if (!parentCompanyDetails[0]) {
          return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_401_UNAUTHORIZED, messages.sso_invalid_parent_client);
        }
        const parentCompany = parentCompanyDetails[0];
        const parentCheck = AuthController.validateSsoClient(parentCompany, client_secret, clientIp);
        if (!parentCheck.valid) {
          return CommonHelper.sendErrorUnencrypt(res, parentCheck.statusCode, parentCheck.message);
        }
        // the client id is either the parent itself or one of its child companies
        if (String(client_id) === String(parent_client_id)) {
          company = parentCompany;
        } else {
          const childCompanyDetails = await PatientService.getCompanyDetailsByParent(client_id, parentCompany.id);
          if (!childCompanyDetails[0]) {
            return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_401_UNAUTHORIZED, messages.sso_client_not_under_parent);
          }
          company = childCompanyDetails[0];
        }
      } else {
        // credentials belong to the company itself
        const companyDetails = await PatientService.getCompanyDetails(client_id);
        if (!companyDetails[0]) {
          return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_401_UNAUTHORIZED, messages.sso_invalid_client);
        }
        company = companyDetails[0];
        // SEC-016: removed a console.log of the full company row, which included
        // client_secret and api_ip_whitelist.
        const clientCheck = AuthController.validateSsoClient(company, client_secret, clientIp);
        if (!clientCheck.valid) {
          return CommonHelper.sendErrorUnencrypt(res, clientCheck.statusCode, clientCheck.message);
        }
      }

      const company_id = company.id;
      let patient = await Patient.findOne({ where: { email } });

      if (patient) {
        // an existing account may only be logged in by the client it belongs to
        const connectedUser = await ConnectedCompaniesPatient.findOne({ where: { patientEmail : email, companyId : company_id } });
        if (!connectedUser && Number(patient.companyId) !== Number(company_id)) {
          return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_403_FORBIDDEN, messages.sso_user_other_client);
        }
      }

      if (!patient) {
        const uuid = CommonHelper.generateUuidV4();
        // the client owns the authentication, there is no password to log in with so a random one is stored
        // SEC-003: bcrypt, not MD5. The value is random and never used to log in.
        const hash_password = await hashPassword(crypto.randomBytes(32).toString('hex'));
        const createdPatientId = await PatientService.createSsoPatient(first_name, last_name, email, mobile || '', company_id, uuid, hash_password);

        if (!createdPatientId) {
          return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_400_BAD_REQUEST, "Unable to create the user.");
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
        return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided email.");
      }

      const { token } = await AuthService.patientLogin(patient);
      const userDetails = await PatientService.getPatientDetailsByEmail(email, patient);
      if (userDetails.length === 0) {
        return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_404_NOT_FOUND, "No patient found with the provided email.");
      }
      userDetails.role = "patient";

      return CommonHelper.sendSuccessUnencrypt(res, true, STATUS_CODE.HTTP_200_OK, messages.loginSuccess, { token, refreshToken, userDetails });
    } catch (error) {
      return CommonHelper.sendErrorUnencrypt(res, STATUS_CODE.HTTP_400_BAD_REQUEST, error.message);
    }
  }

  static async createUserBeforeEmailValidation(req, res, next){

       try { 
        const {employer_id,company_name,employee_name,employee_email,employee_mobile,employee_password,company_address} = req.body;
        const uuid = CommonHelper.generateUuidV4();
        // SEC-003: bcrypt replaces unsalted MD5.
        const hash_password = await hashPassword(employee_password);

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
              // SEC-017: previously signed with the API's own JWT_SECRET and no
              // token type, so an email-verification link was accepted by the
              // authentication middleware as an API session. It now uses a
              // separate secret, a `typ` claim and a 1-hour expiry.
              const token = issueEmailToken({ patientDEtails });

          // Construct verification URL
              const verificationLink = `${PATIENT_FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;

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
      // SEC-017: verifies against the email-token secret with the type checked,
      // so an API access token cannot be replayed here either.
      const decoded = verifyEmailToken(token);
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
        // SEC-003: bcrypt replaces unsalted MD5.
        const hash_password = await hashPassword(employee_password);

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
