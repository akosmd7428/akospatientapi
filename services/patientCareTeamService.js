const PatientCareTeam = require('../models/patientCareTeamModel');
const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');

class PatientCareTeamService {
    static async addDoctorsToCareTeam(data, patientId) {
        try {
            await PatientCareTeam.destroy({
                where: { patientId }
            });
            const patientCareTeamEntries = await PatientCareTeam.bulkCreate(data, {
                updateOnDuplicate: ['doctorId', 'updatedAt']
            });
            return patientCareTeamEntries;
        } catch (error) {
            throw new Error('Error adding doctors to patient care team');
        }
    }

    static async getCareTeam(patientId, search) {
        let query = `
            SELECT 
                d.id,
                d.name,
                d.experience,
                d.speciality,
                d.profilePic,
                d.doctor_fees
            FROM 
                patientCareTeam as cp
            JOIN 
                doctor d ON cp.doctorId = d.id
            JOIN
                connect_provider pc ON cp.doctorId = pc.doctor_id
            WHERE 
                cp.patientId = :patientId
        `;

        if (search) {
            query += ` AND (d.name LIKE :search OR d.speciality LIKE :search) `;
        }

        const replacements = { patientId };
        if (search) {
            replacements.search = `%${search}%`;
        }

        const doctors = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT
        });

        return doctors;
    }
}

module.exports = PatientCareTeamService;
