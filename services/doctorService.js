const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');
const DoctorAvailability = require('../models/DoctorAvailability');
const { Op } = require('sequelize');


class DoctorService {
    // static async getDoctorsByEmployer(employer_id, search) {
    //     let query = `
    //         SELECT 
    //             d.id,
    //             d.name,
    //             d.experience,
    //             d.speciality,
    //             cp.room_alias,
    //             cp.profilePic
    //         FROM 
    //             connect_provider cp
    //         JOIN 
    //             doctor d ON cp.doctor_id = d.id
    //         WHERE 
    //             cp.employer_id = :employer_id
    //     `;

    //     if (search) {
    //         query += ` AND (d.name LIKE :search OR d.speciality LIKE :search) `;
    //     }

    //     const replacements = { employer_id };
    //     if (search) {
    //         replacements.search = `%${search}%`;
    //     }

    //     const doctors = await sequelizeDB1.query(query, {
    //         replacements,
    //         type: QueryTypes.SELECT
    //     });

    //     return doctors;
    // }

    static async getDoctorsByEmployer(employer_id, search) {
        let query = `
            SELECT 
                d.id,
                d.name,
                d.experience,
                d.speciality,
                cp.room_alias,
                d.profilePic
            FROM 
               doctor d
            LEFT JOIN
                connect_provider cp ON  d.id = cp.doctor_id
            LEFT JOIN 
                doctor_employer de  ON  d.id = de.doctor_id
            WHERE 
                de.employer_id = :employer_id
        `;

        if (search) {
            query += ` AND (d.name LIKE :search OR d.speciality LIKE :search) `;
        }

        const replacements = { employer_id };
        if (search) {
            replacements.search = `%${search}%`;
        }

        const doctors = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT
        });

        return doctors;
    }

    static async getDoctorAvailability(doctorId) {
        const availabilityData = await DoctorAvailability.findAll({
            where: { doctorId },
            attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'isActive', 'isHoliday'],
            order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']]
        });

        // Group by dayOfWeek and aggregate slots
        const groupedAvailability = availabilityData.reduce((result, slot) => {
            const day = slot.dayOfWeek;

            // Check if the day already exists in the result
            if (!result[day]) {
                result[day] = {
                    dayOfWeek: day,
                    isHoliday: slot.isHoliday,
                    slots: []
                };
            }

            // If not a holiday, push the slot details to the slots array
            if (!slot.isHoliday) {
                result[day].slots.push({
                    id: slot.id,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    isActive: slot.isActive
                });
            }

            return result;
        }, {});

        // Convert the result object into an array
        return Object.values(groupedAvailability);
    }
  
}

module.exports = DoctorService;



