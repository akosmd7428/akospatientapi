const CareNavigator = require('../models/careNavigatorModel');
const HelpFaq = require('../models/helpFaqModel');
const Patient = require('../models/patientModel');
const { Op } = require('sequelize');
const Hr = require('../models/hrModel');

class HelpService {
  static async getHelpFaq(searchQuery) {
    const faqData = await HelpFaq.findAll({
      where: {
        title: {
          [Op.like]: `%${searchQuery}%`,
        },
        isActive: true,
      },
      order: [['id', 'ASC']],
      attributes: ['title', 'description'],
    });

    return faqData;
  }

  static async getPatientDetailsByEmail(email) {
    const patient = await Patient.findOne({
      where: { email },
      attributes: ['first_name', 'last_name', 'email', 'phone'],
    });
    
    if (!patient) {
      throw new Error('Patient not found');
    }

    return patient;
  }

  static async getCareNavigatorDetailsByEmail(email) {
    const careNavigator = await CareNavigator.findOne({
      where: { email },
      attributes: ['name', 'email', 'phone'],
    });
    
    if (!careNavigator) {
      throw new Error('Care Navigator not found');
    }

    return careNavigator;
  }

  static async getHrDetailsByEmail(email) {
    console.log(email);
    const hrDetails = await Hr.findOne({
      where: { email },
      attributes: ['name', 'email', 'phone'],
    });
    console.log(hrDetails);
    if (!hrDetails) {
      throw new Error('hr not found');
    }

    return hrDetails;
  }

}

module.exports = HelpService;
