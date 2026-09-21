const AppointmentService = require('../services/appointmentService');
const { assertCanAccessPatient } = require('../helpers/authorization'); // SEC-011
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const { LIVE_MCHEMIST_URL, APPOINTMENT_STATUS } = require('../config/secret');
const labTestService = require('../services/labTestService');
const VitalMonitoringService = require('../services/vitalMonitoringService');
class AppointmentController {
    static async bookAppointment(req, res, next) {
        try {
            const { doctorId, date, time, is_paid } = req.body;
            // SEC-011
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);
            const appointmentData = {
                patientId,
                doctorId,
                date,
                time,
                isConfirmed: false,
                isActive: true,
               is_paid
            };

            await AppointmentService.checkAppointment(patientId, doctorId, date, time,is_paid);
            const appointment = await AppointmentService.bookAppointment(appointmentData);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentBooked, { appointment });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async checkAppointmentStatus(req, res, next){
        try {
            const { doctorId, date, time, is_paid } = req.body;
            // SEC-011
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);            
            const rn = await AppointmentService.checkAppointment(patientId, doctorId, date, time,is_paid);
            if(rn === 1){
                 return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.noAppointmentsFound, {  });
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.noAppointmentsFound, {  });           
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getAppointments(req, res, next) {
        // try {
            const { status } = req.params;
            const { search } = req.query;
            const patientId = req.user.id;
    
            const appointments = await AppointmentService.getAppointmentsByStatus(patientId, status, search);
    
            // if (!appointments || appointments.length === 0) {
            //     return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.noAppointmentsFound);
            // }
    
            // Process each appointment asynchronously
            const validAppointments = await Promise.all(appointments.map(async (appointment) => {
                const { appointmentId, doctorName, speciality, experience, date, time, isConfirmed, call_started, call_ended, status, prescriptionURL, profilePic, doctorId } = appointment;
                const dateTime = new Date(`${date} ${time}`).toLocaleString('en-US', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true
                });
            
                let callDuration = null;
                let appointmentStatus = APPOINTMENT_STATUS.CANCELLED;
            
                // Completed Case
                if (status == 2 && call_started && call_ended) {
                    const durationMs = new Date(call_ended) - new Date(call_started);
                    const durationSec = durationMs / 1000; // Convert to seconds
                    callDuration = new Date(durationMs).toISOString().substr(11, 8); // HH:mm:ss
                    if (callDuration && durationSec > 10) {
                        appointmentStatus = APPOINTMENT_STATUS.COMPLETED;
                        return {
                            appointmentId,
                            doctorName,
                            speciality,
                            experience,
                            dateTime,
                            callDuration,
                            prescriptionURL,
                            appointmentStatus,
                            profilePic,
                            doctorId,
                        };
                    }
                }
            
                // Upcoming Case
                if (status == 1) {
                    const doctorDetails = await AppointmentService.fetchDoctorDetails([doctorId]);
                    appointmentStatus = APPOINTMENT_STATUS.UPCOMING;
                    // Parse appointment date and time as a local Date object
                    const appointmentDateTime = new Date(`${date}T${time}`); // Local timestamp in milliseconds
                    // Parse the date string in UTC
                    const dateString = new Date(appointmentDateTime);
                    // Get individual date components in local timezone
                    const year = dateString.getFullYear();
                    const month = dateString.getMonth();       // Note: getMonth() returns 0-indexed month
                    const day = dateString.getDate();
                    const hours = dateString.getHours();
                    const minutes = dateString.getMinutes();
                    const seconds = dateString.getSeconds();
                    const milliseconds = dateString.getMilliseconds();

                    // Create a new date in the local timezone
                    const localDate = new Date(year, month, day, hours, minutes, seconds, milliseconds);

                    // Calculate the timestamp in milliseconds
                    const timestampInMilliseconds = localDate.valueOf();

                    const dateNew = new Date();

                    // Convert UTC time to IST (UTC + 5:30)
                    dateNew.setMinutes(dateNew.getMinutes() + 330);
                    
                    // Get the date components for IST
                    const yearT = dateNew.getFullYear();
                    const monthT = String(dateNew.getMonth() + 1).padStart(2, '0'); // Months are zero-based
                    const dayT = String(dateNew.getDate()).padStart(2, '0');
                    
                    // Get the time components in IST
                    const hoursT = String(dateNew.getHours()).padStart(2, '0');
                    const minutesT = String(dateNew.getMinutes()).padStart(2, '0');
                    const secondsT = String(dateNew.getSeconds()).padStart(2, '0');
                    const millisecondsT = String(dateNew.getMilliseconds()).padStart(3, '0');
                    
                    // Combine into the desired format without 'Z' or offset
                    const localDateT = new Date(`${yearT}-${monthT}-${dayT}T${hoursT}:${minutesT}:${secondsT}.${millisecondsT}Z`);
                    // Calculate the timestamp in milliseconds
                    const timestampInMillisecondsT = localDateT.valueOf();
                    // Define activation window: 5 minutes before to 15 minutes after the appointment time
                    const startTime = timestampInMilliseconds - 300000; // 5 minutes before
                    const endTime = timestampInMilliseconds + 900000;   // 15 minutes after

                    // Determine if the "Join Now" button should be active
                    const joinNow = timestampInMillisecondsT >= startTime && timestampInMillisecondsT <= endTime ? 1 : 0;
                    return {
                        appointmentId,
                        doctorName,
                        speciality,
                        experience,
                        dateTime,
                        isConfirmed,
                        appointmentStatus,
                        profilePic,
                        doctorId,
                        doctorDetails,
                        joinNow, // Return joinNow value
                    };
                }
                if (status == 3) {
                    // Cancelled Case
                    return {
                        appointmentId,
                        doctorName,
                        speciality,
                        experience,
                        dateTime,
                        appointmentStatus,
                        profilePic,
                        doctorId,
                    };
                }
                return null;
            }));          
            
            // Filter out null values
            const formattedAppointments = validAppointments.filter(appointment => appointment !== null);            
    
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentFetched, { formattedAppointments });
        // } catch (error) {
        //     return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        // }
    }
    

    static async myMedicines(req, res, next) {
        try {
            let { search, timeFilter } = req.query;
            const patientId = req.user.id;
        
            const medicines = await AppointmentService.getMyMedicines(patientId, '2', search, timeFilter);

            // if (!medicines || medicines.length === 0) {
            //     return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.noMedicinesFound);
            // }

            const formattedMedicines = medicines.map(medicine => {
                const { medicineId, doctorName, speciality, experience, date, time, prescriptionURL, profilePic } = medicine;
                const dateTime = new Date(`${date} ${time}`).toLocaleString('en-US', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true
                });

                let medicineURL = LIVE_MCHEMIST_URL;
                return {
                    medicineId,
                    doctorName,
                    speciality,
                    experience,
                    dateTime,
                    prescriptionURL,
                    medicineURL,
                    profilePic
                };
            });

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.medicinesFetched, { formattedMedicines });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async rescheduleAppointment(req, res) {
        try {
            const { appointmentId, date, time } = req.body;
            const updatedAppointment = await AppointmentService.rescheduleAppointment(appointmentId, date, time);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentReschedule, { updatedAppointment });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async cancelAppointment(req, res) {
        try {
            const { appointmentId } = req.body;
            const updatedAppointment = await AppointmentService.cancelAppointment(appointmentId);
            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentCancelled, { updatedAppointment });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getAppointmentDetails(req, res, next) {
        try {
            const { appointmentId } = req.params;
            const patientId = req.user.id;

            const appointmentDetails = await AppointmentService.getAppointmentDetails(appointmentId, patientId);

            // if (!appointmentDetails) {
            //     return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.serverError, "Appointment not found");
            // }

            const response = {
                doctorDetails: {
                    doctorId: appointmentDetails.doctorId,
                    name: appointmentDetails.doctorName,
                    speciality: appointmentDetails.speciality,
                    profilePic: appointmentDetails.doctorProfilePic,
                    appointmentDate: appointmentDetails.appointmentDate,
                    appointmentTime: appointmentDetails.appointmentTime,
                },
                patientDetails: {
                    name: appointmentDetails.firstName+' '+appointmentDetails.lastName,
                    patientId: appointmentDetails.patientId,
                    profilePic: appointmentDetails.profilePic,
                    age: appointmentDetails.age,
                    dateofbirth: appointmentDetails.dateofbirth,
                    gender: appointmentDetails.gender,
                    location: appointmentDetails.city+', '+appointmentDetails.state,
                    bloodGroup: appointmentDetails.bloodgroup
                },
                healthDetails: {
                    overAllHealthScore: "98",
                    sugar: "90",
                    heartRate: "72",
                    temperature: "98` F",
                    bloodPressure: "115/80"
                },
                prescriptionURL: appointmentDetails.prescriptionURL,
                connectCallLog: {
                    diagnosis: appointmentDetails.diagnosis,
                    lab_findings: appointmentDetails.labFindings,
                    suggested_investigations: appointmentDetails.suggestedInvestigations,
                    special_instructions: appointmentDetails.specialInstructions,
                    chief_complaints: appointmentDetails.chiefComplaints,
                },
                files: [],
                medicinePrescribed:
                [
                    {
                        medicineName: appointmentDetails.medicineName,
                        drugForm: appointmentDetails.drugForm,
                        strength: appointmentDetails.strength,
                        frequency: appointmentDetails.frequency,
                        duration: appointmentDetails.duration,
                    }
                ]
            };

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentDetailsFetched, { response });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getMedicalRecords(req, res, next) {
        try {
            const patientId = req.user.id;
            const { companyId } = req.params;

            const { patientDetails, carePlan, appointments, files } = await AppointmentService.getMedicalRecords(patientId, companyId);
            const getLabTestsListByPatient = await labTestService.getLabTestsListByPatient(patientId);
            if (!patientDetails) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.serverError, "Patient not found");
            }

            const response = {
                patientDetails: {
                    name: patientDetails.firstName+' '+patientDetails.lastName,
                    patientId: patientDetails.patientId,
                    profilePic: patientDetails.profilePic,
                    totalAppointments: patientDetails.appointmentCount,
                    labTestsCount: getLabTestsListByPatient.length,  // Placeholder for now
                    carePlanName: carePlan ? carePlan.packageName : '',
                },
                allergies: patientDetails.medical_allergies,
                medications: patientDetails.medications,
                files: files,
                labTests: getLabTestsListByPatient.length > 0 ? getLabTestsListByPatient : [],
                appointments: appointments.map(appointment => {
                    // Combine date and time and format it
                    const dateTimeString = `${appointment.appointmentDate} ${appointment.appointmentTime}`;
                    const formattedDateTime = new Date(dateTimeString).toLocaleString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric',
                        hour12: true
                    });
            
                    return {
                        doctorId: appointment.doctorId,
                        doctorName: appointment.doctorName,
                        profilePic: appointment.doctorProfilePic,
                        speciality: appointment.speciality,
                        appointmentId: appointment.appointmentId,
                        dateTime: formattedDateTime,
                        typeofcall: 'Appointment',
                        status: appointment.status
                    };
                }),
            };

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.medicalDetailsFetched, { response });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async fetchCallDetails(req, res, next) {
        try {
            // SEC-011
            const patientId = await assertCanAccessPatient(req.user, req.body.patientId ?? req.user.id);
            const data = await AppointmentService.fetchDoctorIds(patientId);

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { data });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async talkToDoctor(req, res, next) {
        try {
           // console.log("pp",req.user.id);
            const patientId = req.user.id;
            const patientDetails = await AppointmentService.talkToDoctorDetails(patientId);
            const patientDetail = await AppointmentService.getPatientDetails(patientId);
            const data = await AppointmentService.fetchDoctorIds(patientId);
            const doctorIds = data.doctorIds.length > 0 ? data.doctorIds: [];
            let doctorDetails;
            // get In process patient details
            const inProcessPatientData = await AppointmentService.fetchInprocessPatient(patientId);
            if(doctorIds.length > 0){
                doctorDetails = await AppointmentService.fetchDoctorDetails(doctorIds);
            }else{
                throw new Error("Currently, No doctor is available to connect.");
            }
            
            const response = {
                patientDetails: {
                    name: patientDetails.firstName+' '+patientDetails.lastName,
                    patientId: patientDetails.patientId,
                    parent_id: patientDetails.parent_id,
                    email: patientDetails.email,
                    phone: patientDetails.phone,
                    uuid: patientDetails.uuid,
                    profilePic: patientDetail.profilePic,
                    age: patientDetails.age,
                    height: patientDetail.height,
                    weight: patientDetail.weight,
                    dateofbirth: patientDetails.dateofbirth,
                    gender: patientDetails.gender,
                    location: patientDetails.city+', '+patientDetails.state,
                    bloodGroup: patientDetail.bloodgroup,
                    symptoms: patientDetail.symptoms,
                    vaccinations: patientDetail.vaccinations,
                    medications: patientDetail.medications,
                    medical_allergies: patientDetail.medical_allergies,
                    health_problems: patientDetail.health_problems   
                },
                doctorDetails:doctorDetails,
                doctorCallData: data,
                inProcessPatientData:inProcessPatientData
            };

            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { response });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async dashboard(req, res, next) {
        try {
            const patientId = req.user.id;

            const dashboardDetails = await AppointmentService.getDashboardData(patientId);
            const healthDetails = await VitalMonitoringService.getPatientDeviceRating(patientId); 

            const bloodPressureSystolic = healthDetails.systolic?healthDetails.systolic:'--';
            const bloodPressureDiastolic = healthDetails.diastolic?healthDetails.diastolic:'--'
            const bloodPresure = bloodPressureSystolic+ " / "+bloodPressureDiastolic;
            const response = {
                doctorDetails: {
                    doctorId: dashboardDetails.length ? dashboardDetails[0].lastAppointmentDoctorId : null,
                    name: dashboardDetails.length ? dashboardDetails[0].lastAppointmentDoctorName : null,
                    speciality: dashboardDetails.length ? dashboardDetails[0].lastAppointmentSpeciality : null,
                    profilePic: dashboardDetails.length ? dashboardDetails[0].lastAppointmentDoctorProfilePic : null,
                    appointmentDate: dashboardDetails.length ? dashboardDetails[0].lastAppointmentDate : null,
                    appointmentTime: dashboardDetails.length ? dashboardDetails[0].lastAppointmentTime : null,
                    appointmentId: dashboardDetails.length ? dashboardDetails[0].lastAppointmentId : null
                },
                patientDetails: {
                    name: dashboardDetails.length ? `${dashboardDetails[0].firstName} ${dashboardDetails[0].lastName}` : null,
                    patientId: dashboardDetails.length ? dashboardDetails[0].patientId : null,
                    uniquePatientId: dashboardDetails.length ? dashboardDetails[0].uniquePatientId : null,
                    profilePic:dashboardDetails.length ? dashboardDetails[0].patientProfilePic : null,
                    age: dashboardDetails.length ? dashboardDetails[0].age : null,
                    dateofbirth: dashboardDetails.length ? dashboardDetails[0].dateofbirth : null,
                    gender: dashboardDetails.length ? dashboardDetails[0].gender : null,
                    location: dashboardDetails.length ? `${dashboardDetails[0].city}, ${dashboardDetails[0].state}` : null,
                    bloodGroup: dashboardDetails.length ? dashboardDetails[0].bloodgroup : null
                },
                careTeamDetails: dashboardDetails.map(ct => ( ct.careTeamDoctorName ? {
                    careTeamDoctorName: ct.careTeamDoctorName || '',
                    careTeamDoctorId: ct.careTeamDoctorId || '',
                    careTeamSpeciality: ct.careTeamSpeciality || '',
                    careTeamProfilePic: ct.careTeamDoctorProfilePic || ''
                } : {})),
                healthDetails: {
                    overAllHealthScore: "--",
                    sugar: healthDetails.sugar?healthDetails.sugar:'--',
                    heartRate: healthDetails.heartRate?healthDetails.heartRate:'--',
                    temperature: healthDetails.temperature?healthDetails.temperature:'--',
                    bloodPressure: bloodPresure,
                   // bloodPressureDiastolic: healthDetails.diastolic?healthDetails.diastolic:'--'
                },
                allergies: dashboardDetails.length ? dashboardDetails[0].medical_allergies : null,
                medications: dashboardDetails.length ? dashboardDetails[0].medications : null,
                notes: dashboardDetails.length ? dashboardDetails[0].notes : null,
            };
            // Function to check if the object is empty
            const isEmptyObject = obj => Object.keys(obj).length === 0;

            // Function to check if the array contains a blank object
            const containsBlankObject = array => array.some(item => isEmptyObject(item));

            // Usage
            const hasBlankObject = containsBlankObject(response.careTeamDetails);
            if(hasBlankObject){
                response.careTeamDetails = [];
            }
            
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { response });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getMedicines(req, res) {
        try {
            const { search } = req.query;
            let medicines;
            if(search){
                medicines = await AppointmentService.searchMedicines(search);
            }else{
                medicines = await AppointmentService.getActiveMedicines();
            }
            // Ensure that `medicines` is an array before modifying it
            if (Array.isArray(medicines)) {
                // Add the "Other" medicine at the beginning of the array
                medicines.unshift({
                    "id": 0,
                    "medicineName": "Other"
                });
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.medicinesFetched, { medicines });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
}

module.exports = AppointmentController;
