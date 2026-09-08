const Patient = require('../models/patientModel');
const CommonHelper = require('../helpers/commonHelper');
const messages = require('../config/language').messages;
const { STATUS_CODE } = require('../config/constant');

class PatientProfileController {
  static async getPatientProfile(req, res, next) {
    const { email } = req.user;

    try {
      const patient = await Patient.findOne({ where: { email } });
      if (!patient) {
        return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.userNotFound);
      }

      const dependents = await Patient.findAll({ where: { parent_id: patient.id } });

      return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.profileFetched, { patient, dependents });
    } catch (error) {
      next(error);
    }
  }

  static async createOrUpdateProfile(req, res, next) {
    const { id, fullname, email, mobile, dateofbirth, age, bloodgroup, emergency_contact, current_location, profile_image, aadharcard, abha_id, medications, medical_allergies, other_information, dependents } = req.body;

    try {
      let patient;
      if (id) {
        patient = await Patient.findByPk(id);
        if (!patient) {
          return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.userNotFound);
        }
        await patient.update({ fullname, email, mobile, dateofbirth, age, bloodgroup, emergency_contact, current_location, profile_image, aadharcard, abha_id, medications, medical_allergies, other_information });
      } else {
        // patient = await Patient.create({ fullname, email, mobile, dateofbirth, age, bloodgroup, emergency_contact, current_location, profile_image, aadharcard, abha_id, medications, medical_allergies, other_information, parent_id: 0 });
      }

      // Handle dependents
      if (dependents && Array.isArray(dependents)) {
        for (const dependent of dependents) {
          const { id, fullname, email, mobile, dateofbirth, age, bloodgroup, emergency_contact, current_location, profile_image, aadharcard, abha_id, medications, medical_allergies, other_information } = dependent;
          if (id) {
            let existingDependent = await Patient.findByPk(id);
            if (existingDependent) {
              await existingDependent.update({ fullname, email, mobile, dateofbirth, age, bloodgroup, emergency_contact, current_location, profile_image, aadharcard, abha_id, medications, medical_allergies, other_information });
            }
          } else {
            // await Patient.create({ fullname, email, mobile, dateofbirth, age, bloodgroup, emergency_contact, current_location, profile_image, aadharcard, abha_id, medications, medical_allergies, other_information, parent_id: patient.id });
          }
        }
      }

      return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, id ? messages.profileUpdated : messages.profileCreated, { patient });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PatientProfileController;
