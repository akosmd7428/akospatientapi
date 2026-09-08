const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Patient = require('../models/patientModel');
const crypto = require('crypto');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');
const CareNavigator = require('../models/careNavigatorModel');
const Hr = require('../models/hrModel');

class AuthService {
  static async register(data) {
    const { email, password, first_name, last_name } = data;
    const hashedPassword = await bcrypt.hash(password, 10);

    const patient = await Patient.create({
      email,
      password: hashedPassword,
      first_name,
      last_name,
    });

    return patient;
  }

  static async login(data) {
    const { email, password, getRole } = data;
    let user;
    let role;    
    // Check if patient exists
    if(getRole){
      if(getRole == "patient"){
        user = await Patient.findOne({ where: { email } });
        role = 1;      
      }
      if(getRole == "careNavigator"){
        user = await CareNavigator.findOne({ where: { email } });
        role = 2;
      }    
      if(getRole == "hr"){
        user = await Hr.findOne({ where: { email } });
        role = 3;
      }    
      if (!user) {
        throw new Error('Invalid email or password');
      }
      // Create the MD5 hash of the plaintext password
      const hash = crypto.createHash('md5').update(password).digest('hex');     
      // Compare the hashed password with the stored hash
      const passwordMatch = hash === user.password;     
      if (!passwordMatch) {
        throw new Error('Invalid email or password');
      }
      if(getRole == "careNavigator"){
         if(user.isActive == 0)
         {
          throw new Error('Invalid email or password');
         }
      }
    //  const roleName = role == 1 ? "patient" : "careNavigator";
    let roleName ='';
      if(role == 1){
        roleName = "patient";
      }else if(role == 2){
        roleName = "careNavigator";
      }else{
        roleName = "hr";
      }
      
      const token = jwt.sign({ id: user.id, email: user.email, role:roleName }, process.env.JWT_SECRET, { expiresIn: '1d' });
  
      return { token, user, role };
    }
  }

  static async patientLogin(patient) {
    const token = jwt.sign({ id: patient.id, email: patient.email, role:"patient" }, process.env.JWT_SECRET, { expiresIn: '1d' });

    return { token };
  }
  
  
}

module.exports = AuthService;
