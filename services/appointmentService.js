const Appointment = require('../models/appointmentModel');

const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');
const { APPOINTMENT_STATUS } = require('../config/secret');
const Medicine = require('../models/medicine');
const { Op } = require('sequelize');
const Patient = require('../models/patientModel');
const Doctor = require('../models/doctorModel');
const { emailHelperSMTP } = require('../helpers/emailHelperSMTP');
const { sendSms } = require('./smsService');
const CareNavigator = require('../models/careNavigatorModel');
const NotificationService = require('./notificationService');

class AppointmentService {
    static async bookAppointment(data) {
        try {
            const appointment = await Appointment.create(data);
            const patient = await Patient.findOne({ where: { id: appointment.patientId } });
            console.log("patiennt booking time");
            // Prepare dynamic content for SMS
           // patient.email = "mohan.pal@akosmdtech.com"
            const patientName = patient.first_name +' '+patient.last_name;
            //send email to patient
            const email_service = await emailHelperSMTP(appointment.patientId, patient.email, 'Appointment Requested', `<p>Hi ${patientName}, <br/></br>Your appointment with AkosMD is requested for ${appointment.date} at ${appointment.time} and awaiting confirmation. We will update you once confirmed. If you need to reschedule, contact us at +91-8595461929.<br/>Looking forward to your appointment! <br/><br/>Thank you!<br/>Team AkosMD</p>`);                
           // console.log(email_service);
            // Create SMS messages with dynamic content
            const patientSMSMsg = `Hi ${patientName}, your requested appointment with AkosMD for ${appointment.date} at ${appointment.time} is awaiting confirmation, We will update you upon confirmation.`;
           // patient.phone = '9711500543';
            await sendSms(patient.phone, patientSMSMsg, "1007457160894207069");

            return appointment;
        } catch (error) {
            throw new Error('Error booking appointment');
        }
    }

    static async checkAppointment(patientId, doctorId, date, time,is_paid) {
        // Check if an appointment already exists with the same date, time, and doctor
        const existingAppointment = await Appointment.findOne({
            where: {
                patientId,
                doctorId,
                date,
                time
            

            }
        });
        //  isActive: true, comment for the not exist
         // isConfirmed: true,
        if (existingAppointment) {
            throw new Error('An appointment already exists');
        }

        // Check if an appointment exists with the same date and time but a different doctor
        const conflictingAppointment = await Appointment.findOne({
            where: {
                patientId,
                date,
                time,
               
                doctorId: {
                    [Op.ne]: doctorId
                }
            }
        });
        // isActive: true,
        if (conflictingAppointment) {
            throw new Error('An appointment exists with a different doctor.');
        }
        
        return 1;
    }

    static async getAppointmentsForCareNavigator(status, searchQuery, filter,careCompanyIds) {
        const indiaTimeZone = 'Asia/Kolkata';

        const localDate = new Intl.DateTimeFormat('en-CA', { 
            timeZone: indiaTimeZone, 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).format(new Date()); // YYYY-MM-DD format for India time

        const localTime = new Intl.DateTimeFormat('en-CA', { 
            timeZone: indiaTimeZone, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: false 
        }).format(new Date()); // HH:MM:SS format for India time

        let query = `
                SELECT 
                a.id AS appointmentId,
                a.patientId,
                CONCAT(p.first_name, ' ', p.last_name) AS patientName,
                d.email AS doctorEmail,
                d.name AS doctorName,
                a.date,
                a.time,
                a.status,
                a.callId,
                a.isConfirmed,
                MAX(pd.profile_image) AS patientProfilePic,
                MAX(c.call_started) AS call_started, 
                MAX(c.call_ended) AS call_ended,    
                MAX(tp.prescriptionURL) AS prescriptionURL,
                MAX(d.profilePic) AS profilePic, 
                a.doctorId
            FROM 
                appointments a
            JOIN 
                doctor d ON a.doctorId = d.id
            LEFT JOIN 
                patient p ON a.patientId = p.id
            LEFT JOIN 
                patientDetails pd ON p.id = pd.patientId
            LEFT JOIN 
                connect_call_log c ON a.id = c.appointmentId
            LEFT JOIN 
                tbl_prescription tp ON a.id = tp.appointmentId
            JOIN 
                connect_provider cp ON a.doctorId = cp.doctor_id
            WHERE 
                a.isActive = true 
                AND a.status = :status
                ${status == 2 ? 'AND (a.callId IS NOT NULL AND a.callId <> \'\')' : ''}
                ${status == 1 ? `AND (
                    (a.date > :localDate) 
                    OR (a.date = :localDate AND a.time >= :localTime)
                )` : ''}
                AND p.employer_id IN (${careCompanyIds})
        `;              
        switch (filter) {
            case '1': // Last month
                query += ` AND a.date >= DATE_SUB(NOW(), INTERVAL 1 MONTH) `;
                break;
            case '2': // Last 6 months
                query += ` AND a.date >= DATE_SUB(NOW(), INTERVAL 6 MONTH) `;
                break;
            case '3': // Last 1 year
                query += ` AND a.date >= DATE_SUB(NOW(), INTERVAL 1 YEAR) `;
                break;
            default:
                break;
        }
    
        if (searchQuery) {
            query += ` AND (d.name LIKE :search OR CONCAT(p.first_name, ' ', p.last_name) LIKE :search) `;
        }
    
        query += `GROUP BY 
                a.id, a.patientId, patientName, doctorEmail, doctorName, a.date, a.time, a.status, a.callId, a.isConfirmed, a.doctorId,pd.patientId
            ORDER BY 
                a.date DESC
            `;
    
        const replacements = {
            status,
            localDate,
            localTime,
        };
    
        if (searchQuery) {
            replacements.search = `%${searchQuery}%`;
        }
    
        const appointments = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT
        });
    
        return appointments;
    }     

    static async getAppointmentsForDashboard(status,careCompanyIds) {
        let query = `
                SELECT DISTINCT
                a.id AS appointmentId,
                a.patientId,
                CONCAT(p.first_name, ' ', p.last_name) AS patientName,
                a.date,
                a.time,
                a.status,
                a.isConfirmed
            FROM 
                appointments a
            LEFT JOIN 
                patient p ON a.patientId = p.id
            WHERE 
                a.isActive = true 
                AND a.status = :status
                 AND p.employer_id IN (${careCompanyIds})
            ORDER BY 
                a.date DESC
            LIMIT 5;
        `;
        
        const replacements = {
            status,
        };
    
        const appointments = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT
        });
    
        return appointments;
    }    

    static async getAppointmentsByStatus(patientId, status, searchQuery) {

        const indiaTimeZone = 'Asia/Kolkata';

        const localDate = new Intl.DateTimeFormat('en-CA', { 
            timeZone: indiaTimeZone, 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).format(new Date()); // YYYY-MM-DD format for India time

        const localTime = new Intl.DateTimeFormat('en-CA', { 
            timeZone: indiaTimeZone, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: false 
        }).format(new Date()); // HH:MM:SS format for India time

        let query = `
                SELECT 
                a.id AS appointmentId,
                a.patientId,
                d.name AS doctorName,
                d.speciality,
                d.experience,
                a.date,
                a.time,
                a.status,
                a.callId,
                a.isConfirmed,
                MAX(c.call_started) AS call_started, -- Aggregate call_started
                MAX(c.call_ended) AS call_ended,     -- Aggregate call_ended
                MAX(p.prescriptionURL) AS prescriptionURL, -- Aggregate prescription URLs
                MAX(d.profilePic) AS profilePic,     -- Aggregate profilePic
                MAX(cp.room_alias) AS room_alias,    -- Aggregate room_alias
                a.doctorId
            FROM 
                appointments a
            JOIN 
                doctor d ON a.doctorId = d.id
            LEFT JOIN 
                connect_call_log c ON a.id = c.appointmentId
            LEFT JOIN 
                tbl_prescription p ON a.id = p.appointmentId
            JOIN 
                connect_provider cp ON a.doctorId = cp.doctor_id
            WHERE 
                a.patientId = :patientId 
                AND a.isActive = true 
                AND a.status = :status
                ${status == 2 ? ' AND (a.callId IS NOT NULL AND a.callId <> \'\')' : ''}
                ${status == 1 ? ` AND (
                    (a.date >= :localDate) 
                    OR (a.date = :localDate AND a.time >= :localTime)
                )` : ''}
        `;
    
        if (searchQuery) {
            query += ` AND (d.name LIKE :search OR d.speciality LIKE :search) `;
        }
    
       query += `GROUP BY 
                    a.id, a.patientId, d.name, d.speciality, d.experience, a.date, a.time, a.status, a.callId, a.isConfirmed, a.doctorId
                ORDER BY 
                    a.date DESC;`;
        const replacements = {
            patientId,
            status,
            localDate,
            localTime,
        };
    
        if (searchQuery) {
            replacements.search = `%${searchQuery}%`;
        }
    
        const appointments = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT
        });
    
        return appointments;
    }      

    static async getMyMedicines(patientId, status, searchQuery, timeFilter) {
        let query = `
           SELECT 
            a.id as medicineId,
            a.patientId,
            d.name as doctorName,
            d.speciality,
            d.experience,
            a.date,
            a.time,
            p.prescriptionURL,
            d.profilePic
        FROM 
            appointments a
        JOIN 
            doctor d ON a.doctorId = d.id
        JOIN 
            tbl_prescription p ON a.id = p.appointmentId
        WHERE 
            a.patientId = :patientId 
            AND a.isConfirmed = true 
            AND a.isActive = true 
            AND a.status = :status
            ${status == 2 ? 'AND (a.callId IS NOT NULL AND a.callId <> \'\')' : ''}
        `;
        
        switch (timeFilter) {
            case '1': // Last month
                query += ` AND a.date >= DATE_SUB(NOW(), INTERVAL 1 MONTH) `;
                break;
            case '2': // Last 6 months
                query += ` AND a.date >= DATE_SUB(NOW(), INTERVAL 6 MONTH) `;
                break;
            case '3': // Last 1 year
                query += ` AND a.date >= DATE_SUB(NOW(), INTERVAL 1 YEAR) `;
                break;
            // case '0': // 'All' filter (no additional condition needed)
            //     break;
            default:
                // For 'all' or any unexpected input, no additional condition needed
                break;
        }

        if (searchQuery) {
            query += ` AND d.name LIKE :search `;
        }
    
        query += `GROUP BY 
                    a.id, a.patientId, d.name, d.speciality, d.experience, a.date, a.time, p.prescriptionURL, d.profilePic
                ORDER BY 
                    a.date DESC`;

        const replacements = {
            patientId,
            status
        };
    
        if (searchQuery) {
            replacements.search = `%${searchQuery}%`;
        }
    
        const medicines = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT
        });
    
        return medicines;
    }

    static async rescheduleAppointment(appointmentId, date, time) {
        try {
            const updatedAppointment = await Appointment.update(
                { date, time, isConfirmed:false, status:1 },
                { where: { id: appointmentId } }
            );
            const appointment = await Appointment.findOne({ where: { id: appointmentId } });
            const patient = await Patient.findOne({ where: { id: appointment.patientId } });
            console.log(patient,'patient');
            
            // Prepare dynamic content for SMS
            const patientName = patient.first_name +' '+patient.last_name;
            // Create SMS messages with dynamic content
            const patientSMSMsg = `Hi ${patientName}, your requested appointment with AkosMD for ${date} at ${time} is awaiting confirmation, We will update you upon confirmation.`;
            await sendSms(patient.phone, patientSMSMsg, "1007457160894207069");

            return updatedAppointment;
        } catch (error) {
            throw new Error('Error rescheduling appointment');
        }
    }

    static async cancelAppointment(appointmentId) {
        try {
            const updatedAppointment = await Appointment.update(
                { status: APPOINTMENT_STATUS.CANCELLED_VALUE },  // Assuming status 3 means canceled
                { where: { id: appointmentId } }
            );
            // Fetch appointment, patient, and doctor details
            const appointment = await Appointment.findOne({ where: { id: appointmentId } });
            const patient = await Patient.findOne({ where: { id: appointment.patientId } });
            const doctor = await Doctor.findOne({ where: { id: appointment.doctorId } });

            // Prepare dynamic content for SMS
            const patientName = patient.first_name +' '+patient.last_name;
            const doctorName = doctor.name; 

            //Create and send email to patient and doctor 
            await emailHelperSMTP(appointment.patientId, patient.email, 'Call Cancelled', `<p>Hi ${patientName}, <br/></br>We regret to inform you that your telehealth call scheduled for ${appointment.date} at ${appointment.time} has been cancelled. Please contact us at +91-8595461929 to reschedule or for any further assistance. We apologize for the inconvenience and appreciate your understanding. <br/><br/>Thank you!<br/>Team AkosMD</p>`);      
        
            await emailHelperSMTP(appointment.doctorId, doctor.email, 'Call Cancelled', `<p>Hi ${doctorName}, <br/></br>The telehealth call with ${patientName} scheduled for ${appointment.date} at ${appointment.time} has been cancelled. Please check your schedule for any adjustments. If you need further details or have any questions, please contact us at +91-8595461929.<br/><br/>Thank you!<br/>Team AkosMD</p>`);  
            
            // Create SMS messages with dynamic content
            const patientSMSMsg = `Hi ${patientName}, we regret to inform you that your call scheduled for ${appointment.date} at ${appointment.time} has been cancelled. Team AkosMD`;
            const doctorSMSMsg = `Hi ${doctorName}, the call with ${patientName} scheduled for ${appointment.date} at ${appointment.time} has been cancelled. Team AkosMD.`;

            await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
            await sendSms(doctor.phoneNo, doctorSMSMsg, "1007329269383755445");
             //Trigger Notification
             const patientNotifyData = {
                "title" : "Call Cancelled",
                "description": `We regret to inform you that your call scheduled for ${appointment.date} at ${appointment.time} has been cancelled`,
                "referenceId": appointment.patientId,
                "role" : "patient"
            }
            NotificationService.createNotification(patientNotifyData);
            const doctorNotifyData = {
                "title" : "Call Cancelled",
                "description": `The call with ${patientName} scheduled for ${appointment.date} at ${appointment.time} has been cancelled`,
                "referenceId": appointment.doctorId,
                "role" : "doctor"
            }
            NotificationService.createNotification(doctorNotifyData);
            return updatedAppointment;
        } catch (error) {
            throw new Error('Error canceling appointment');
        }
    }

    static async approveAppointment(appointmentId) {
        try {
            const updatedAppointment = await Appointment.update(
                { isConfirmed: true },
                { where: { id: appointmentId } }
            );
            return updatedAppointment;
        } catch (error) {
            throw new Error('Error approving appointment');
        }
    }

    static async updateAppointment(appointmentId, status, careNavigatorId) {
        try {
            let updatedAppointment = 0;
            let careNavigatorName= '';
            if(status == 1){
                const careNavigator = await CareNavigator.findOne({ where: { id: careNavigatorId } });
                if(careNavigator){
                    careNavigatorName = careNavigator.name;
                }
                updatedAppointment = await Appointment.update(
                    { isConfirmed: true, approvedByCareNavigator: careNavigatorName },
                    { where: { id: appointmentId } }
                );
                // Fetch appointment, patient, and doctor details
                const appointment = await Appointment.findOne({ where: { id: appointmentId } });
                const patient = await Patient.findOne({ where: { id: appointment.patientId } });
                const doctor = await Doctor.findOne({ where: { id: appointment.doctorId } });

                // Prepare dynamic content for SMS
                const patientName = patient.first_name +' '+patient.last_name;
                const doctorName = doctor.name; 
                //Create and send email to patient and doctor 
                await emailHelperSMTP(appointment.patientId, patient.email, 'Call Scheduled', `<p>Hi ${patientName}, <br/></br>Your telehealth call with AkosMD has been confirmed for ${appointment.date} at ${appointment.time}. Please make sure to be available at that time and have a stable internet connection. If you have any questions or need to make changes, please contact us at +91-8595461929. See you then! <br/><br/>Thank you!<br/>Team AkosMD</p>`);      
                
                await emailHelperSMTP(appointment.doctorId, doctor.email, 'Consultation Booked', `<p>Hi ${doctorName}, <br/></br>A new telehealth consultation has been scheduled with ${patientName} on ${appointment.date} at ${appointment.time}. Please check your schedule and ensure you are prepared for the consultation. If you need to adjust the timing or have any questions, please contact us at +91-8595461929.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      

                // Create SMS messages with dynamic content
                const patientSMSMsg = `Hi ${patientName}, your telehealth call with AkosMD has been confirmed for ${appointment.date} at ${appointment.time}. Reach out to us if you have any query.`;
                const doctorSMSMsg = `Hi ${doctorName}, a new consultation has been scheduled with ${patientName} on ${appointment.date} at ${appointment.time}. Thankyou Team AkosMD.`;
                await sendSms(patient.phone, patientSMSMsg, "1007625141669091757");
                await sendSms(doctor.phoneNo, doctorSMSMsg, "1007657909759333566");
                 //Trigger Notification
                 const patientNotifyData = {
                    "title" : "Call Scheduled",
                    "description": `Your telehealth call with AkosMD has been confirmed for ${appointment.date} at ${appointment.time}`,
                    "referenceId": appointment.patientId,
                    "role" : "patient"
                }
                NotificationService.createNotification(patientNotifyData);
                const doctorNotifyData = {
                    "title" : "Consultation Booked",
                    "description": `A new consultation has been scheduled with ${patientName} on ${appointment.date} at ${appointment.time}`,
                    "referenceId": appointment.doctorId,
                    "role" : "doctor"
                }
                NotificationService.createNotification(doctorNotifyData);
            }
            else{
                updatedAppointment = await Appointment.update(
                    { status: APPOINTMENT_STATUS.CANCELLED_VALUE },  // Assuming status 3 means canceled
                    { where: { id: appointmentId } }
                );
                // Fetch appointment, patient, and doctor details
                const appointment = await Appointment.findOne({ where: { id: appointmentId } });
                const patient = await Patient.findOne({ where: { id: appointment.patientId } });
                const doctor = await Doctor.findOne({ where: { id: appointment.doctorId } });

                // Prepare dynamic content for SMS
                const patientName = patient.first_name +' '+patient.last_name;
                const doctorName = doctor.name; 

                //Create and send email to patient and doctor 
                await emailHelperSMTP(appointment.patientId, patient.email, 'Call Cancelled', `<p>Hi ${patientName}, <br/></br>We regret to inform you that your telehealth call scheduled for ${appointment.date} at ${appointment.time} has been cancelled. Please contact us at +91-8595461929 to reschedule or for any further assistance. We apologize for the inconvenience and appreciate your understanding. <br/><br/>Thank you!<br/>Team AkosMD</p>`);      
            
                await emailHelperSMTP(appointment.doctorId, doctor.email, 'Call Cancelled', `<p>Hi ${doctorName}, <br/></br>The telehealth call with ${patientName} scheduled for ${appointment.date} at ${appointment.time} has been cancelled. Please check your schedule for any adjustments. If you need further details or have any questions, please contact us at +91-8595461929.<br/><br/>Thank you!<br/>Team AkosMD</p>`);      

                // Create SMS messages with dynamic content
                const patientSMSMsg = `Hi ${patientName}, we regret to inform you that your call scheduled for ${appointment.date} at ${appointment.time} has been cancelled. Team AkosMD`;
                const doctorSMSMsg = `Hi ${doctorName}, the call with ${patientName} scheduled for ${appointment.date} at ${appointment.time} has been cancelled. Team AkosMD.`;

                await sendSms(patient.phone, patientSMSMsg, "1007143436825772656");
                await sendSms(doctor.phoneNo, doctorSMSMsg, "1007329269383755445");
                //Trigger Notification
                const patientNotifyData = {
                    "title" : "Call Cancelled",
                    "description": `We regret to inform you that your call scheduled for ${appointment.date} at ${appointment.time} has been cancelled`,
                    "referenceId": appointment.patientId,
                    "role" : "patient"
                }
                NotificationService.createNotification(patientNotifyData);
                const doctorNotifyData = {
                    "title" : "Call Cancelled",
                    "description": `The call with ${patientName} scheduled for ${appointment.date} at ${appointment.time} has been cancelled`,
                    "referenceId": appointment.doctorId,
                    "role" : "doctor"
                }
                NotificationService.createNotification(doctorNotifyData);
            }
            return updatedAppointment;
        } catch (error) {
            throw new Error('Error approving appointment');
        }
    }

    static async getAppointmentDetails(appointmentId, patientId) {
        const query = `
            SELECT 
                p.first_name AS firstName,
                p.last_name AS lastName,
                p.id AS patientId,
                TIMESTAMPDIFF(YEAR, p.dateofbirth, CURDATE()) AS age,
                p.dateofbirth,
                p.gender,
                p.city AS city,
                p.state AS state,
                tp.prescriptionURL,
                d.name AS doctorName,
                d.speciality,
                d.profilePic AS doctorProfilePic,
                a.date AS appointmentDate,
                a.time AS appointmentTime,
                a.doctorId,
                c.allergies,
                c.medications,
                ppd.diagnosis,
                pd.profile_image as profilePic,
                pd.bloodgroup,
                ppd.previousHistory,
                ppd.labFindings,
                ppd.suggestedInvestigations,
                ppd.specialInstructions,
                ppd.chiefComplaints,
                mp.medicineName,
                mp.frequency,
                mp.duration,
                mp.strength,
                mp.drugForm
            FROM 
                appointments a
            JOIN 
                patient p ON a.patientId = p.id
            JOIN 
                doctor d ON a.doctorId = d.id
            LEFT JOIN
                patientDetails pd ON a.patientId = pd.patientId
            LEFT JOIN 
                tbl_prescription tp ON a.id = tp.appointmentId
            LEFT JOIN 
                connect_call_log c ON a.id = c.appointmentId
            LEFT JOIN 
                patientPrescriptionDetails ppd ON a.id = ppd.appointmentId
            LEFT JOIN 
                medicinePrescribed mp ON ppd.id = mp.prescriptionId
            WHERE 
                a.id = :appointmentId AND a.patientId = :patientId
        `;
    
        const replacements = { appointmentId, patientId };
    
        const [results] = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT,
        });
    
        return results;
    }    


    static async getMedicalRecords(patientId, companyId) {
        const patientQuery = `
            SELECT 
                pd.profile_image as profilePic,
                pd.medications,
                pd.medical_allergies,
                p.first_name AS firstName,
                p.last_name AS lastName,
                p.id AS patientId,
                (SELECT COUNT(*) FROM appointments a WHERE a.patientId = p.id AND a.status = 2) AS appointmentCount
            FROM 
                patient p
            LEFT JOIN
                patientDetails pd ON p.id = pd.patientId
            LEFT JOIN
                carePlans cp ON p.id = pd.patientId
            WHERE 
                p.id = :patientId
        `;
    
        const fileQuery = `
            SELECT 
                pf.id as fileId, 
                pf.fileName, 
                pf.fileType, 
                pf.fileUrl, 
                DATE_FORMAT(pf.createdAt, '%d/%m/%Y') as createdAt 
            FROM 
                patientFolders pfr
            LEFT JOIN 
                patientFiles pf ON pf.folderId = pfr.id
            WHERE 
                folderType = 1
                AND pfr.isActive = 1
                AND pfr.patientId = :patientId
        `;
        
        const appointmentsQuery = `
            SELECT 
                a.id as appointmentId,
                a.patientId,
                d.name as doctorName,
                d.profilePic as doctorProfilePic,
                d.speciality,
                a.date as appointmentDate,
                a.time as appointmentTime,
                a.doctorId,
                CASE 
                    WHEN a.status = 1 THEN 'Upcoming'
                    WHEN a.status = 2 THEN 'Completed'
                    WHEN a.status = 3 THEN 'Cancelled'
                END as status
            FROM 
                appointments a
            JOIN 
                doctor d ON a.doctorId = d.id
            WHERE 
                a.patientId = :patientId
                AND a.status = 2
        `;
    
        const planQuery = `
            SELECT 
                cp.packageName
            FROM 
                carePlans cp
            WHERE 
                cp.companyId = :companyId
        `;
        
        const replacements = { patientId, companyId };
    
        const [patientDetails] = await sequelizeDB1.query(patientQuery, { replacements, type: QueryTypes.SELECT });
        const [ carePlan ] = await sequelizeDB1.query(planQuery, { replacements, type: QueryTypes.SELECT });
        const appointments = await sequelizeDB1.query(appointmentsQuery, { replacements, type: QueryTypes.SELECT });
        const files = await sequelizeDB1.query(fileQuery, { replacements, type: QueryTypes.SELECT });
    
        return { patientDetails, carePlan, appointments, files };
    }
    
    static async fetchDoctorIds(patientId) {
        const query = `
          SELECT 
              d.id AS doctorId,
              cp.room_alias,
              cp.staff_id,
              cp.id AS connectDoctorId,
              cpg.group_id
          FROM 
              doctor d
            LEFT JOIN 
              connect_provider cp ON d.id = cp.doctor_id
            LEFT JOIN 
              connect_waiting_room cwr ON cp.id = cwr.pcp_doctor_id
            LEFT JOIN 
              doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN 
              speciality s ON s.id = ds.speciality_id AND s.is_active = 1
            LEFT JOIN 
              doctor_employer de ON d.id = de.doctor_id
            LEFT JOIN 
              worksman_company_list wcl ON wcl.id = de.employer_id
            LEFT JOIN 
              connectedCompaniesPatient ccp ON ccp.companyId = wcl.id
            LEFT JOIN 
              connect_provider_groups cpg ON cp.id = cpg.connect_provider_id
            WHERE 
                d.isOnline = 1
                AND d.active=1
               
                AND wcl.active = 1
                AND ccp.patientId = :patientId 
                AND ccp.connectionType=1 
                AND ccp.status=1 AND ccp.isActive=1
            GROUP BY
                d.id, cp.room_alias, cp.id, cpg.group_id
        `;
    
        const replacements = { patientId };
    
        // try {
            const results = await sequelizeDB1.query(query, {
                replacements,
                type: QueryTypes.SELECT,
            });
            // Filter the array to get unique entries based on doctorId, room_alias, and connectDoctorId
            // const groupedData = [];
            const uniqueSet = new Set();
            const doctorIds = [];
            const groupIds = [];
            const roomAlias = [];
            const connectDoctorIds = [];

            results.forEach(item => {
                const uniqueKey = `${item.doctorId}-${item.room_alias}-${item.connectDoctorId}`;
                
                if (!uniqueSet.has(uniqueKey)) {
                    // groupedData.push({
                    //     doctorId: item.doctorId,
                    //     room_alias: item.room_alias,
                    //     connectDoctorId: item.connectDoctorId,
                    //     group_id: item.group_id
                    // });
                    doctorIds.push(item.doctorId);
                    connectDoctorIds.push(item.connectDoctorId);
                    groupIds.push(item.group_id);
                    roomAlias.push(item.room_alias);

                    uniqueSet.add(uniqueKey);
                }
            });
            const data = {
                doctorIds: doctorIds,
                connectDoctorIds:connectDoctorIds,
                groupIds: groupIds,
                roomAlias: roomAlias
            }
            console.log(data,'Final Call list for talk to doctor as per patient and doctor availability===============');
          return data;
        // } catch (error) {
        //   throw new Error('Error fetching doctor details');
        // }
    }
    
    static async fetchDoctorDetails(doctorIds) {
        const query = `
          SELECT 
              d.id AS doctorId,
              d.name AS doctorName,
              d.email,
              d.phoneNo,
              d.reg_no,
              d.signature,
              d.degree,
              d.profilePic,
              d.address,
              cp.room_alias,
              cp.staff_id,
              cp.id AS connectDoctorId,
              cpg.group_id
          FROM 
              doctor d
          JOIN 
              connect_provider cp ON d.id = cp.doctor_id
          JOIN 
              connect_provider_groups cpg ON cp.id = cpg.connect_provider_id
          WHERE 
              d.id IN (:doctorIds)
        `;
    
        const replacements = { doctorIds };
    
        try {
          const results = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT,
          });
    
          // Process results to group by doctorId
          const groupedResults = results.reduce((acc, row) => {
            if (!acc[row.doctorId]) {
              acc[row.doctorId] = {
                doctorId: row.doctorId,
                doctorName: row.doctorName,
                email: row.email,
                phoneNo: row.phoneNo,
                reg_no: row.reg_no,
                signature: row.signature,
                degree: row.degree,
                profilePic: row.profilePic,
                address: row.address,
                room_alias: row.room_alias,
                staff_id: row.staff_id,
                connectDoctorId: row.connectDoctorId,
                groups: [], // Initialize groups array
              };
            }
            // Add group_id to the groups array if it's not already present
            if (!acc[row.doctorId].groups.includes(row.group_id)) {
              acc[row.doctorId].groups.push(row.group_id);
            }
            return acc;
          }, {});
    
          // Convert the groupedResults object into an array
          const resultArray = Object.values(groupedResults);
    
          return resultArray;
        } catch (error) {
          throw new Error('Error fetching doctor details');
        }
    }

    static async fetchDoctorDetail(doctorId) {
        const query = `
          SELECT 
              d.id AS doctorId,
              d.name AS doctorName,
              d.email,
              d.phoneNo,
              d.reg_no,
              d.signature,
              d.degree,
              d.address,
              cp.id AS connectDoctorId,
              cpg.group_id
          FROM 
              doctor d
          JOIN 
              connect_provider cp ON d.id = cp.doctor_id
          JOIN 
              connect_provider_groups cpg ON cp.id = cpg.connect_provider_id
          WHERE 
              d.id = :doctorId
        `;
    
        const replacements = { doctorId };
    
        try {
          const [result] = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT,
          });
    
          // Process results to group by doctorId
          const response = result ? {
                doctorId: result.doctorId,
                doctorName: result.doctorName,
                email: result.email,
                phoneNo: result.phoneNo,
                reg_no: result.reg_no,
                signature: result.signature,
                degree: result.degree,
                address: result.address,
                connectDoctorId: result.connectDoctorId,
            } : {};

            return response;
    
        } catch (error) {
          throw new Error('Error fetching doctor detail');
        }
    }

    static async talkToDoctorDetails(patientId) {
        const query = `
            SELECT 
                p.first_name AS firstName,
                p.last_name AS lastName,
                p.id AS patientId,
                p.parent_id,
                p.email,
                p.phone,
                p.uuid,
                TIMESTAMPDIFF(YEAR, p.dateofbirth, CURDATE()) AS age,
                p.dateofbirth,
                p.gender,
                p.city AS city,
                p.state AS state
            FROM 
                patient p
            WHERE 
                p.id = :patientId
        `;

        const replacements = { patientId };

        const [results] = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT,
        });

        return results;
    }

    static async getPatientDetails(patientId) {
        const query = `
            SELECT 
                pd.profile_image as profilePic,
                pd.age,
                pd.height,
                pd.weight,
                pd.bloodgroup,
                pd.symptoms,
                pd.vaccinations,
                pd.medications,
                pd.medical_allergies,
                pd.health_problems
            FROM 
                patientDetails pd
            WHERE 
                pd.patientId = :patientId
        `;

        const replacements = { patientId };

        const [results] = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT,
        });
        
        return results;
    }

    static async getDashboardData(patientId) {
        const query = `
            SELECT 
                p.first_name AS firstName,
                p.last_name AS lastName,
                p.id AS patientId,
                p.uniquePatientId AS uniquePatientId,
                p.dateofbirth,
                p.gender,
                p.city AS city,
                p.state AS state,
                la.doctorName AS lastAppointmentDoctorName,
                la.speciality AS lastAppointmentSpeciality,
                la.doctorId AS lastAppointmentDoctorId,
                la.doctorProfilePic AS lastAppointmentDoctorProfilePic,
                la.appointmentDate AS lastAppointmentDate,
                la.appointmentTime AS lastAppointmentTime,
                la.appointmentId AS lastAppointmentId,
                ct.doctorId AS careTeamDoctorId,
                ct.doctorName AS careTeamDoctorName,
                ct.speciality AS careTeamSpeciality,
                ct.doctorProfilePic AS careTeamDoctorProfilePic,
                pd.profilePic AS patientProfilePic,
                pd.age AS age,
                pd.notes AS notes,
                pd.bloodgroup AS bloodgroup,
                pd.medications AS medications,
                pd.medical_allergies AS medical_allergies
            FROM 
                patient p
            LEFT JOIN (
                SELECT 
                    a.patientId,
                    d.name AS doctorName,
                    d.speciality,
                    d.id AS doctorId,
                    d.profilePic AS doctorProfilePic,
                    a.date AS appointmentDate,
                    a.time AS appointmentTime,
                    a.id AS appointmentId
                FROM 
                    appointments a
                JOIN 
                    doctor d ON a.doctorId = d.id
                WHERE 
                    a.patientId = :patientId 
                    AND a.date >= CURDATE()
                    AND a.status = 1
                ORDER BY 
                    a.date ASC, a.time ASC
                LIMIT 1
            ) AS la ON p.id = la.patientId
            LEFT JOIN (
                SELECT 
                    pd.profile_image as profilePic,
                    pd.age as age,
                    pd.notes as notes,
                    pd.bloodgroup as bloodgroup,
                    pd.medications as medications,
                    pd.medical_allergies as medical_allergies
                FROM 
                    patientDetails pd
                WHERE 
                    pd.patientId = :patientId
            ) AS pd ON p.id = :patientId
            LEFT JOIN (
                SELECT 
                    pct.patientId,
                    d.id AS doctorId,
                    d.name AS doctorName,
                    d.speciality,
                    d.profilePic AS doctorProfilePic
                FROM 
                    patientCareTeam pct
                JOIN 
                    doctor d ON pct.doctorId = d.id
                WHERE 
                    pct.patientId = :patientId
                ORDER BY 
                    pct.createdAt DESC
                LIMIT 2
            ) AS ct ON p.id = ct.patientId
            WHERE 
                p.id = :patientId
             LEFT JOIN (
                SELECT 
                    vpm.patient_id,
                    vpm.id AS doctorId,
                    vpm.param_key_name AS param_name,
                    vpm.param_value                    
                FROM 
                    vital_patient_monitoring vpm
                JOIN 
                    patient p ON vpm.patient_id = p.id
                WHERE 
                    vpm.patient_id = :patientId and vpm.param_key_id = 3 
                ORDER BY 
                    vpm.createdAt DESC
                LIMIT 1
            ) AS ct ON p.id = ct.patientId
            WHERE 
                p.id = :patientId
        `;

        const replacements = { patientId };

        const results = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT,
        });

        return results;
    }

    static async getActiveMedicines(limit = 20) {
        return Medicine.findAll({
            where: { isActive: true, isDeleted: false },
            attributes: ['id', 'medicineName'],
            order: [['id', 'ASC']],
            limit,
        });
    }

    static async searchMedicines(search, limit = 20) {
        return Medicine.findAll({
            where: {
                isActive: true,
                isDeleted: false,
                medicineName: {
                    [Op.like]: `${search}%`
                }
            },
            attributes: ['id', 'medicineName'],
            limit,
        });
    }

    static async fetchInprocessPatient(patientId){
        const query = `
            SELECT 
                cwr.session,
                cwr.token,
                cwr.status,
                cwr.call_id,
                cwr.pcp_doctor_id as connectedDocId,
                cp.doctor_id as doctorId               
            FROM 
                connect_waiting_room as cwr
            JOIN
                connect_provider as cp
            ON
                cwr.pcp_doctor_id = cp.id
            WHERE 
                cwr.patient_id = :patientId
        `;

        const replacements = { patientId };

        const [results] = await sequelizeDB1.query(query, {
            replacements,
            type: QueryTypes.SELECT,
        });
        
        return results;
    }
    
}

module.exports = AppointmentService;
