const Patient = require('../models/patientModel');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');
const { generateOtp, validateOtp, consumeVerifiedOtp, canSendOtp } = require('../helpers/otpHelper');
const { messages } = require('../config/language');
const crypto = require('crypto');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const EmailTemplates = require('../helpers/emailTemplates');
const CareNavigator = require('../models/careNavigatorModel');
const Hr = require('../models/hrModel');

// same answer whether or not the email is registered, so the api cannot be used to find accounts
const OTP_SENT = "OTP sent successfully";

// error the controller may show to the client as it is
const clientError = (message) => {
  const error = new Error(message);
  error.isClientError = true;
  return error;
};

class ForgotPasswordService {
  static async sendOtp(email, role) {
    let account = null;
    if(role == "patient"){
      account = await Patient.findOne({ where: { email } });
    }
    if(role == "careNavigator"){
      account = await CareNavigator.findOne({ where: { email } });
    }
    if(role == "dependent"){
      account = await ConnectedCompaniesPatient.findOne({ where: { patientEmail: email } });
    }
    if(role == "hr"){     
      account = await Hr.findOne({ where: { email } });
    }

    // the otp is only made and mailed for a real account, and not again within the resend cooldown
    if (account && canSendOtp(email)) {
      const otp = generateOtp(email, role);
      const { subject, html } = EmailTemplates.otpCode({ otp });
      await emailHelperSMTP(email, email, subject, html);
    }
    return OTP_SENT;
  }


  static async verifyOtp(email, otp) {
    const isValid = validateOtp(email, otp);
    if (!isValid) {
      throw clientError(messages.invalidOtp);
    }
    return messages.otpVerified;
  }

  // forgot password: only allowed right after the otp of this email was verified, for the role the otp was sent for
  static async resetPassword(email, newPassword) {
    const verified = consumeVerifiedOtp(email);
    if (!verified) {
      throw clientError(messages.invalidOtp);
    }
    return ForgotPasswordService.changePassword(email, newPassword, verified.role);
  }

  // logged in user: the email always comes from the caller's own account, never from the request
  static async changeOwnPassword(user, newPassword) {
    const models = { patient: Patient, careNavigator: CareNavigator, hr: Hr };
    const model = models[user.role];
    const account = model ? await model.findOne({ where: { id: user.id } }) : null;
    if (!account || !account.email || (user.role !== 'patient' && (account.isActive == 0 || account.isDeleted == 1))) {
      throw clientError("This email is not registered with us");
    }
    return ForgotPasswordService.changePassword(account.email, newPassword, user.role);
  }

  static async changePassword(email, newPassword,role) {

    // Create the MD5 hash of the plaintext password
    const hashedPassword = crypto.createHash('md5').update(newPassword).digest('hex');
    const uniquePatientId = Math.floor(10000 + Math.random() * 90000);
    if(role == 'hr'){
      const hrData = await Hr.findOne({ where: { email } });
      if(!hrData){
        throw clientError("This email is not registered with us");
      }else{
        await Hr.update({ password: hashedPassword }, { where: { email } });
      }
      return messages.passwordChanged;
    }
    // a care navigator only ever changes the care navigator account, never a patient with the same email
    if(role == 'careNavigator'){
      const careNavigator = await CareNavigator.findOne({ where: { email } });
      if (!careNavigator) {
        throw clientError("This email is not registered with us");
      }
      await CareNavigator.update({ password: hashedPassword }, { where: { email } });
      return messages.passwordChanged;
    }
    const patient = await Patient.findOne({ where: { email } });
    if (!patient) {
      const patientEmailExists = await ConnectedCompaniesPatient.findOne({ where: { patientEmail : email } });
      if(patientEmailExists){
        const patientDetail =  await Patient.create({ email: email, password: hashedPassword, uniquePatientId: uniquePatientId });
        //Generation of Unique Patient Id here
        if(patientDetail){
          await ConnectedCompaniesPatient.update({ password: hashedPassword, patientId:patientDetail.id, uniquePatientId: uniquePatientId, status: true, isActive: true }, { where: { patientEmail: email } });
        }
      }else{
        throw clientError("This email is not registered with us");
      }
    }else{
      if(patient.isFirstLogin == 1 && patient.isProfileCompleted == 1){
        await Patient.update({ password: hashedPassword }, { where: { email } });
      }else{
        await Patient.update({ password: hashedPassword, uniquePatientId: uniquePatientId }, { where: { email } });
      }
    }

    return messages.passwordChanged;
  }


}

module.exports = ForgotPasswordService;
