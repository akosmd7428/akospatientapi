const Patient = require('../models/patientModel');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');
const { generateOtp, validateOtp } = require('../helpers/otpHelper');
const { messages } = require('../config/language');
const crypto = require('crypto');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const CareNavigator = require('../models/careNavigatorModel');
const Hr = require('../models/hrModel');

class ForgotPasswordService {
  static async sendOtp(email, role) {

    const otp = generateOtp(email);
    const html = `
    <html>
    <body>
        <h2>Your OTP Code</h2>
        <p>Hello,</p>
        <p>Here is your One-Time Password (OTP) code:</p>
        <h1 style="font-size: 24px; color: #007BFF;">${otp}</h1>
        <p>This OTP is valid for 5 minutes. Please use it within this time frame.</p>
        <p>If you did not request this OTP, please ignore this email.</p>
        <p>Thank you!</p>
    </body>
    </html>
    `;
  
    if(role == "patient"){
      const patient = await Patient.findOne({ where: { email } });
      if(patient){
        await emailHelperSMTP(email, email, 'OTP Code', html);
        return "OTP sent successfully";
      }else{
        throw new Error("No Patient found with this email");
      }
    }

    if(role == "careNavigator"){
      const careNavigator = await CareNavigator.findOne({ where: { email } });
      if(careNavigator){
        await emailHelperSMTP(email, email, 'OTP Code', html);
        return "OTP sent successfully";
      }else{
        throw new Error("No Care Navigator found with this email");
      }
    }

    if(role == "dependent"){
      const connectedCompaniesPatient = await ConnectedCompaniesPatient.findOne({ where: { patientEmail: email } });
      if(connectedCompaniesPatient){
        await emailHelperSMTP(email, email, 'OTP Code', html);
        return "OTP sent successfully";
      }else{
        throw new Error("No Dependent found with this email");
      }
    }
    console.log("Hr==sendotp");
    if(role == "hr"){     
      const hr = await Hr.findOne({ where: { email } });
      if(hr){
        await emailHelperSMTP(email, email, 'OTP Code', html);
        return "OTP sent successfully";
      }else{
        throw new Error("No Care Navigator found with this email");
      }
    }

    throw new Error("No User found with this email");
  }


  static async verifyOtp(email, otp) {
    const isValid = validateOtp(email, otp);
    if (!isValid) {
      throw new Error(messages.invalidOtp);
    }
    return messages.otpVerified;
  }

  static async changePassword(email, newPassword,role) {

    // Create the MD5 hash of the plaintext password
    const hashedPassword = crypto.createHash('md5').update(newPassword).digest('hex');
    const uniquePatientId = Math.floor(10000 + Math.random() * 90000);
    const patient = await Patient.findOne({ where: { email } });
    let user; 
    if(role == 'hr'){
      const hrData = await Hr.findOne({ where: { email } });
      if(!hrData){
        throw new Error("This email is not registered with us");
      }else{
        await Hr.update({ password: hashedPassword }, { where: { email } });
      }
      return messages.passwordChanged;
    }
    if (!patient) {
      const patientEmailExists = await ConnectedCompaniesPatient.findOne({ where: { patientEmail : email } });
      if(patientEmailExists){
        const patientDetail =  await Patient.create({ email: email, password: hashedPassword, uniquePatientId: uniquePatientId });
        //Generation of Unique Patient Id here
        if(patientDetail){
          await ConnectedCompaniesPatient.update({ password: hashedPassword, patientId:patientDetail.id, uniquePatientId: uniquePatientId, status: true, isActive: true }, { where: { patientEmail: email } });
        }
      }else{
        // If patient does not exist, check if careNavigator exists
        user = await CareNavigator.findOne({ where: { email } });
        if (!user) {
          throw new Error("This email is not registered with us");
        }else{
          await CareNavigator.update({ password: hashedPassword }, { where: { email } });
        }
      }
    }else{
      if(patient){
        if(patient.isFirstLogin == 1 && patient.isProfileCompleted == 1){
          await Patient.update({ password: hashedPassword }, { where: { email } });
        }else{
          await Patient.update({ password: hashedPassword, uniquePatientId: uniquePatientId }, { where: { email } });
        }
      }else{
        // If patient does not exist, check if careNavigator exists
        user = await CareNavigator.findOne({ where: { email } });
        if (!user) {
          throw new Error("This email is not registered with us");
        }else{
          await CareNavigator.update({ password: hashedPassword }, { where: { email } });
        }    
      }
    }

    return messages.passwordChanged;
  }


}

module.exports = ForgotPasswordService;
