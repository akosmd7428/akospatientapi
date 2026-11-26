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

    // doctors (from the given list) that serve a company the patient, or its parent, is connected to
    static async getAllowedDoctorIds(patientId, doctorIds) {
        const rows = await sequelizeDB1.query(
            `SELECT DISTINCT de.doctor_id AS doctorId
             FROM patient p
             JOIN connectedCompaniesPatient ccp ON ccp.patientId IN (p.id, p.parent_id)
             JOIN doctor_employer de ON de.employer_id = ccp.companyId
             WHERE p.id = :patientId
                AND ccp.isActive = true
                AND de.doctor_id IN (:doctorIds)`,
            { replacements: { patientId, doctorIds }, type: QueryTypes.SELECT }
        );
        return rows.map(row => Number(row.doctorId));
    }

    static async getCompanyDoctorIds(patientId) {
        const rows = await sequelizeDB1.query(
            `SELECT DISTINCT de.doctor_id AS doctorId
             FROM patient p
             JOIN connectedCompaniesPatient ccp ON ccp.patientId IN (p.id, p.parent_id)
             JOIN doctor_employer de ON de.employer_id = ccp.companyId
             JOIN doctor d ON d.id = de.doctor_id
             JOIN connect_provider cp ON cp.doctor_id = d.id
             WHERE p.id = :patientId
                AND ccp.isActive = true
                AND d.active = 1`,
            { replacements: { patientId }, type: QueryTypes.SELECT }
        );
        return rows.map(row => Number(row.doctorId));
    }

    static async ensureCareTeamExists(patientId) {
        const existing = await PatientCareTeam.findOne({ where: { patientId } });
        if (existing) {
            return;
        }
        const doctorIds = await PatientCareTeamService.getCompanyDoctorIds(patientId);
        if (doctorIds.length === 0) {
            return;
        }
        const entries = doctorIds.map(doctorId => ({ patientId, doctorId }));
        await PatientCareTeam.bulkCreate(entries, { ignoreDuplicates: true });
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
