const Patient = require('../models/patientModel');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

class PatientProfileService {
  static async getProfileByEmail(email) {
    return await Patient.findOne({ where: { email , parent_id: 0 } });
  }

  static async createProfile(profileData) {
    profileData.uuid = uuidv4();
    const patient = await Patient.create(profileData);

    if (profileData.dependents && profileData.dependents.length) {
      for (const dependent of profileData.dependents) {
        dependent.parent_id = patient.id;
        await Patient.create(dependent);
      }
    }

    return patient;
  }

  static async updateProfile(profileData) {
    const { id, dependents, ...updatedData } = profileData;
    const patient = await Patient.findByPk(id);

    if (!patient) {
      throw new Error('Patient not found');
    }

    await Patient.update(updatedData, { where: { id } });

    if (dependents && dependents.length) {
      for (const dependent of dependents) {
        if (dependent.id) {
          await Patient.update(dependent, { where: { id: dependent.id } });
        } else {
          dependent.parent_id = id;
          await Patient.create(dependent);
        }
      }
    }

    return await Patient.findByPk(id);
  }
}

module.exports = PatientProfileService;
