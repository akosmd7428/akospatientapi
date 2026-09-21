const PatientDetail = require('../models/patientDetailModel');
const { randomDigits } = require('../helpers/secureRandom'); // SEC-018
const { toIdList } = require('../helpers/sqlSafe'); // SEC-006
const PatientFamilyHistory = require('../models/patientFamilyHistoryModel');
const { sequelizeDB1 } = require('../models');
const { QueryTypes } = require('sequelize');
const Patient = require('../models/patientModel');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');
const fs = require('fs').promises;    
const path = require('path');
const { PATIENT_BACKEND_URL } = require('../config/secret');
const PatientPrescriptionDetails = require('../models/patientPrescriptionDetails');
const MedicinePrescribed = require('../models/medicinePrescribed');
const PatientGeneralPrescription = require('../models/patientGeneralPrescription');
const Prescription = require('../models/prescription');
const PatientFile = require('../models/patientFileModel');
const PatientFolder = require('../models/patientFoldersModel');
const Doctor = require('../models/doctorModel');
const Appointment = require('../models/appointmentModel');
const CarePlan = require('../models/carePlan');
const crypto = require('crypto');

class PatientService {

    static async getProfileByEmail(email) {
        try {
            return await Patient.findOne({ where: { email, parent_id: 0 } });
        } catch (error) {
            console.error("Error in getProfileByEmail:", error);
            throw new Error("Error fetching profile by email");
        }
    }

    static async getProfileByEmailId(email) {
        try {
            return await Patient.findOne({ where: { email } });
        } catch (error) {
            console.error("Error in getProfileByEmail:", error);
            throw new Error("Error fetching profile by email");
        }
    }

    static async getProfileByPatientId(patientId) {
        try {
            return await ConnectedCompaniesPatient.findOne({ where: { patientId } });
        } catch (error) {
            console.error("Error in getProfileByPatientId:", error);
            throw new Error("Error fetching profile by id");
        }
    }
    
    static async getPatientProfileDetails(patientId) {
        const patientQuery = `
            SELECT 
                p.id as patientId,
                p.parent_id as parentId,
                p.first_name,
                p.last_name,
                p.email,
                p.phone,
                p.dateofbirth,
                p.gender,
                p.address1 AS address,
                p.city,
                p.state,
                p.zip_code,
                p.isFirstLogin,
                p.isProfileCompleted,
                p.state,
                pd.age,
                pd.height,
                pd.weight,
                pd.bloodgroup,
                pd.emergency_contact,
                pd.profile_image,
                pd.aadharcard,
                pd.abha_id,
                pd.past_operation_detail,
                pd.social_history,
                pd.sexual_emotional_history,
                pd.symptoms,
                pd.vaccinations,
                pd.consent,
                pd.religious_belief,
                pd.medications,
                pd.medical_allergies,
                pd.health_problems
            FROM patient p
            LEFT JOIN patientDetails pd ON p.id = pd.patientId
            WHERE p.id = :patientId
        `;

        const familyHistoryQuery = `
            SELECT 
                breast_cancer,
                relation_breast_cancer,
                colon_cancer,
                relation_colon_cancer,
                prostate_cancer,
                relation_prostate_cancer,
                skin_cancer,
                relation_skin_cancer,
                ovarian_cancer,
                relation_ovarian_cancer,
                lung_cancer,
                relation_lung_cancer,
                other_cancer,
                relation_other_cancer,
                diabetes,
                relation_diabetes,
                hypertension,
                relation_hypertension,
                heart_disease,
                relation_heart_disease,
                lungs_problem,
                relation_lungs_problem,
                other_problems,
                relation_other_problems,
                alcoholism,
                relation_alcoholism,
                drug_abuse,
                relation_drug_abuse
            FROM patientFamilyHistory
            WHERE patientId = :patientId
        `;

        const dependentsQuery = `
            SELECT 
                p.id as dependentId,
                p.parent_id as parentId,
                p.first_name,
                p.last_name,
                p.email,
                p.phone,
                p.dateofbirth,
                p.gender,
                p.address1 AS address,
                p.city,
                p.state,
                p.zip_code,
                p.isFirstLogin,
                p.isProfileCompleted,
                pd.age,
                pd.height,
                pd.weight,
                pd.bloodgroup,
                pd.emergency_contact,
                pd.profile_image,
                pd.aadharcard,
                pd.abha_id,
                pd.past_operation_detail,
                pd.social_history,
                pd.sexual_emotional_history,
                pd.symptoms,
                pd.vaccinations,
                pd.consent,
                pd.religious_belief,
                pd.medications,
                pd.medical_allergies,
                pd.health_problems
            FROM patient p
            LEFT JOIN patientDetails pd ON p.id = pd.patientId
            WHERE p.parent_id = :patientId
        `;

        const dependentsFamilyHistoryQuery = `
            SELECT 
                p.id as dependentId,
                pfh.breast_cancer,
                pfh.relation_breast_cancer,
                pfh.colon_cancer,
                pfh.relation_colon_cancer,
                pfh.prostate_cancer,
                pfh.relation_prostate_cancer,
                pfh.skin_cancer,
                pfh.relation_skin_cancer,
                pfh.ovarian_cancer,
                pfh.relation_ovarian_cancer,
                pfh.lung_cancer,
                pfh.relation_lung_cancer,
                pfh.other_cancer,
                pfh.relation_other_cancer,
                pfh.diabetes,
                pfh.relation_diabetes,
                pfh.hypertension,
                pfh.relation_hypertension,
                pfh.heart_disease,
                pfh.relation_heart_disease,
                pfh.lungs_problem,
                pfh.relation_lungs_problem,
                pfh.other_problems,
                pfh.relation_other_problems,
                pfh.alcoholism,
                pfh.relation_alcoholism,
                pfh.drug_abuse,
                pfh.relation_drug_abuse
            FROM patient p
            LEFT JOIN patientFamilyHistory pfh ON p.id = pfh.patientId
            WHERE p.parent_id = :patientId
        `;

        const patientData = await sequelizeDB1.query(patientQuery, {
            replacements: { patientId },
            type: QueryTypes.SELECT,
        });

        if (patientData.length === 0) {
            throw new Error('Patient not found');
        }

        const familyHistoryData = await sequelizeDB1.query(familyHistoryQuery, {
            replacements: { patientId },
            type: QueryTypes.SELECT,
        });

        const dependentsData = await sequelizeDB1.query(dependentsQuery, {
            replacements: { patientId },
            type: QueryTypes.SELECT,
        });

        const dependentsFamilyHistoryData = await sequelizeDB1.query(dependentsFamilyHistoryQuery, {
            replacements: { patientId },
            type: QueryTypes.SELECT,
        });

        const patient = patientData[0];

        const response = {
            patientId: patient.patientId,
            parentId: patient.parentId,
            fullname: patient.first_name + ' ' + patient.last_name,
            email: patient.email,
            phone: patient.phone,
            dateofbirth: patient.dateofbirth,
            gender: patient.gender,
            address: patient.address,
            city: patient.city,
            state: patient.state,
            zip_code: patient.zip_code,
            isFirstLogin: patient.isFirstLogin,
            isProfileCompleted: patient.isProfileCompleted,
            age: patient.age,
            height: patient.height,
            weight: patient.weight,
            bloodgroup: patient.bloodgroup,
            emergency_contact: patient.emergency_contact,
            profile_image: patient.profile_image,
            aadharcard: patient.aadharcard,
            abha_id: patient.abha_id,
            past_operation_detail: patient.past_operation_detail,
            social_history: patient.social_history,
            sexual_emotional_history: patient.sexual_emotional_history,
            symptoms: patient.symptoms,
            vaccinations: patient.vaccinations,
            consent: patient.consent,
            religious_belief: patient.religious_belief,
            medications: patient.medications,
            medical_allergies: patient.medical_allergies,
            health_problems: patient.health_problems,
            family_history: familyHistoryData.length > 0 ? familyHistoryData[0] : {},
            dependents: dependentsData.map(dep => {
                const familyHistory = dependentsFamilyHistoryData.find(fh => fh.dependentId === dep.dependentId);
                return {
                    patientId: dep.dependentId,
                    parentId: dep.parentId,
                    fullname: dep.first_name + ' ' + dep.last_name,
                    email: dep.email,
                    phone: dep.phone,
                    dateofbirth: dep.dateofbirth,
                    gender: dep.gender,
                    address: dep.address,
                    city: dep.city,
                    state: dep.state,
                    zip_code: dep.zip_code,
                    isFirstLogin: dep.isFirstLogin,
                    isProfileCompleted: dep.isProfileCompleted,
                    age: dep.age,
                    height: dep.height,
                    weight: dep.weight,
                    bloodgroup: dep.bloodgroup,
                    emergency_contact: dep.emergency_contact,
                    profile_image: dep.profile_image,
                    aadharcard: dep.aadharcard,
                    abha_id: dep.abha_id,
                    past_operation_detail: dep.past_operation_detail,
                    social_history: dep.social_history,
                    sexual_emotional_history: dep.sexual_emotional_history,
                    symptoms: dep.symptoms,
                    vaccinations: dep.vaccinations,
                    consent: dep.consent,
                    religious_belief: dep.religious_belief,
                    medications: dep.medications,
                    medical_allergies: dep.medical_allergies,
                    health_problems: dep.health_problems,
                    family_history: familyHistory ? {
                        breast_cancer: familyHistory.breast_cancer,
                        relation_breast_cancer: familyHistory.relation_breast_cancer,
                        colon_cancer: familyHistory.colon_cancer,
                        relation_colon_cancer: familyHistory.relation_colon_cancer,
                        prostate_cancer: familyHistory.prostate_cancer,
                        relation_prostate_cancer: familyHistory.relation_prostate_cancer,
                        skin_cancer: familyHistory.skin_cancer,
                        relation_skin_cancer: familyHistory.relation_skin_cancer,
                        ovarian_cancer: familyHistory.ovarian_cancer,
                        relation_ovarian_cancer: familyHistory.relation_ovarian_cancer,
                        lung_cancer: familyHistory.lung_cancer,
                        relation_lung_cancer: familyHistory.relation_lung_cancer,
                        other_cancer: familyHistory.other_cancer,
                        relation_other_cancer: familyHistory.relation_other_cancer,
                        diabetes: familyHistory.diabetes,
                        relation_diabetes: familyHistory.relation_diabetes,
                        hypertension: familyHistory.hypertension,
                        relation_hypertension: familyHistory.relation_hypertension,
                        heart_disease: familyHistory.heart_disease,
                        relation_heart_disease: familyHistory.relation_heart_disease,
                        lungs_problem: familyHistory.lungs_problem,
                        relation_lungs_problem: familyHistory.relation_lungs_problem,
                        other_problems: familyHistory.other_problems,
                        relation_other_problems: familyHistory.relation_other_problems,
                        alcoholism: familyHistory.alcoholism,
                        relation_alcoholism: familyHistory.relation_alcoholism,
                        drug_abuse: familyHistory.drug_abuse,
                        relation_drug_abuse: familyHistory.relation_drug_abuse
                    } : {}
                }
            })
        };

        return response;
    }

    static async createOrUpdatePatientProfile(data, patientId, isChild = false) {
        try {
            const {
                age,
                height,
                weight,
                bloodgroup,
                emergency_contact,
                profile_image,
                aadharcard,
                abha_id,
                past_operation_detail,
                social_history,
                sexual_emotional_history,
                symptoms,
                vaccinations,
                consent,
                religious_belief,
                medications,
                medical_allergies,
                health_problems,
                family_history,
            } = data;

            // Save profile image if provided
            let profileImagePath = null;
            if (profile_image != "" || profile_image != null) {
                // profileImagePath = await this.saveImage(profile_image.buffer, profile_image.extension, 'profile');
                // profileImagePath = await this.saveImage(profile_image, 'profile');
            }

            const patientDetailData = {
                patientId,
                age,
                height,
                weight,
                bloodgroup,
                emergency_contact,
                profile_image: profile_image,
                aadharcard,
                abha_id,
                past_operation_detail,
                social_history,
                sexual_emotional_history,
                symptoms,
                vaccinations,
                consent,
                religious_belief,
                medications,
                medical_allergies,
                health_problems,
                isChild: isChild == true ? 1 : 0,
            };

            // Upsert patient details
            let patientDetail = await PatientDetail.findOne({ where: { patientId } });
            if (patientDetail) {
                await PatientDetail.update(patientDetailData, { where: { patientId } });
            } else {
                await PatientDetail.create(patientDetailData);
            }

            // Upsert patient family history
            const familyHistoryData = {
                patientId,
                isChild: isChild == true ? 1 : 0,
                ...family_history,
            };

            let patientFamilyHistory = await PatientFamilyHistory.findOne({ where: { patientId } });
            if (patientFamilyHistory) {
                await PatientFamilyHistory.update(familyHistoryData, { where: { patientId } });
            } else {
                await PatientFamilyHistory.create(familyHistoryData);
            }

        } catch (error) {
            console.error("Error while creating or updating patient profile:", error);
            throw new Error("Error while creating or updating patient profile");
        }
    }

    // static async saveImage(base64Image, type) {
    //     try {
    //         if (!base64Image) return null;
    //         const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    //         const buffer = Buffer.from(base64Data, 'base64');
    //         const year = new Date().getFullYear();
    //         const month = new Date().getMonth() + 1;
    //         const timestamp = Date.now();
    //         const extension = 'jpg';
    //         const fileName = `${type}_${timestamp}.${extension}`;
    //         const dir = path.join(__dirname, '..', 'assets', year.toString(), month.toString());
    //         const filePath = path.join(dir, fileName);
    //         const filePathFinal = `${PATIENT_BACKEND_URL}/assets/${year}/${month}/${fileName}`;

    //         await fs.mkdir(dir, { recursive: true });
    //         await fs.writeFile(filePath, buffer);

    //         return filePathFinal;

    //     } catch (error) {
    //         console.error("Error while saving image:", error);
    //         throw new Error("Error while saving image");
    //     }
    // }

    static async saveImage(buffer, extension, type) {
        try {
            if (!buffer) throw new Error("No image data provided");

            // Extract the image extension from MIME type
            // const extension = mimeType.split('/')[1];
            if (!extension) throw new Error("Unable to determine file extension");

            // Generate file paths
            const year = new Date().getFullYear();
            const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
            const timestamp = Date.now();
            const fileName = `${type}_${timestamp}.${extension}`;
            const dir = path.join(__dirname, '..', 'assets', year.toString(), month);
            const filePath = path.join(dir, fileName);
            const filePathFinal = `${PATIENT_BACKEND_URL}/assets/${year}/${month}/${fileName}`;

            // Ensure the directory exists
            await fs.mkdir(dir, { recursive: true });

            // Write the image file
            await fs.writeFile(filePath, buffer);

            return filePathFinal;

        } catch (error) {
            console.error("Error while saving image:", error);
            throw new Error("Error while saving image");
        }
    }

    static async getPatientDetailsByEmail(patientEmail, patient) {
        let query;
        if(patient.parent_id == 0){
            query = `
            SELECT
                ccp.patientId AS loggedPatientId,
                p.parent_id,
                p.uniquePatientId,
                p.first_name,
                p.last_name,
                p.email,
                p.phone,
                p.address1 AS address,
                p.city,
                p.state,
                p.zip_code,
                p.uuid,
                p.role,
                p.isFirstLogin,
                p.isProfileCompleted,
                ccp.companyId,
                wc.company_name,
                pd.profile_image as profilePic,
                pd.height,
                pd.weight,
                pd.age,
                p.gender,
                p.dateofbirth AS dob,
                pd.bloodgroup,
                pd.symptoms,
                pd.vaccinations,
                pd.medications,
                pd.medical_allergies,
                pd.health_problems
            FROM
                connectedCompaniesPatient ccp
            JOIN
                patient p ON ccp.patientId = p.id
            LEFT JOIN
                patientDetails pd ON ccp.patientId = pd.patientId
            LEFT JOIN
                worksman_company_list wc ON ccp.companyId = wc.id
            WHERE
                ccp.patientEmail = :patientEmail
                AND ccp.isActive = true
                AND (ccp.connectionType = 2 OR wc.id IS NOT NULL);
            `;
        }else{
            query = `
            SELECT
                p.id AS loggedPatientId,
                p.parent_id,
                p.uniquePatientId,
                p.first_name,
                p.last_name,
                p.email,
                p.phone,
                p.city,
                p.state,
                p.zip_code,
                p.uuid,
                p.role,
                p.isFirstLogin,
                p.isProfileCompleted,
                ccp.companyId,
                wc.company_name,
                pd.profile_image as profilePic,
                pd.height,
                pd.weight,
                pd.age,
                p.gender,
                p.dateofbirth AS dob,
                pd.bloodgroup,
                pd.symptoms,
                pd.vaccinations,
                pd.medications,
                pd.medical_allergies,
                pd.health_problems
            FROM
                connectedCompaniesPatient ccp
            JOIN
                patient p ON ccp.patientId = p.parent_id
            LEFT JOIN
                patientDetails pd ON p.id = pd.patientId
            LEFT JOIN
                worksman_company_list wc ON ccp.companyId = wc.id
            WHERE
                p.email = :patientEmail
                AND ccp.isActive = true
                AND (ccp.connectionType = 2 OR wc.id IS NOT NULL);
            `;
        }
    
        const result = await sequelizeDB1.query(query, {
            replacements: { patientEmail },
            type: QueryTypes.SELECT
        });

        return result;
    }
    
    static async getProfileByPatientEmail(patientEmail) {
        try {
            return await ConnectedCompaniesPatient.findOne({ where: { patientEmail } });
        } catch (error) {
            throw new Error("Error fetching profile by email");
        }
    }

    static async savePrescriptionDetail(prescriptionDetail, medicineDetail) {
        try {
            let prescription = '';
            let generalPrescriptionDetail = {};
            if(prescriptionDetail.callId && prescriptionDetail.appointmentId){
                const query = `
                SELECT
                    ccl.appointmentId
                FROM
                    connect_call_log ccl
                WHERE
                    ccl.call_id = :callId
                `;
    
                const [result] = await sequelizeDB1.query(query, {
                    replacements: { callId: prescriptionDetail.callId },
                    type: QueryTypes.SELECT
                });
                prescriptionDetail.appointmentId = result.appointmentId;
                await Appointment.update(
                    { callId: prescriptionDetail.callId },
                    {
                        where: {
                            id: prescriptionDetail.appointmentId
                        }
                    }
                );   
            }
            if (prescriptionDetail.patientId !== 0 && prescriptionDetail.appointmentId !== 0) {
                // When patientId and appointmentId are available
                const existingPrescription = await PatientPrescriptionDetails.findOne({
                    where: {
                        patientId: prescriptionDetail.patientId,
                        appointmentId: prescriptionDetail.appointmentId,
                    },
                });
    
                if (existingPrescription) {
                    // Update existing record
                    await existingPrescription.update(prescriptionDetail);
                    prescription = existingPrescription;
                } else {
                    // Create new record
                    prescription = await PatientPrescriptionDetails.create(prescriptionDetail);
                }
                //Generate prescriptionUniqueId
                const prescriptionUniqueId = Number(randomDigits(5));
                await PatientPrescriptionDetails.update(
                    { prescriptionUniqueId: prescriptionUniqueId },
                    {
                        where: {
                            id: prescription.id
                        }
                    }
                );    
            } else {
                // When appointmentId is not available
                prescription = await PatientPrescriptionDetails.create(prescriptionDetail);
                //Generate prescriptionUniqueId
                const prescriptionUniqueId = Number(randomDigits(5));
                await PatientPrescriptionDetails.update(
                    { prescriptionUniqueId: prescriptionUniqueId },
                    {
                        where: {
                            id: prescription.id
                        }
                    }
                );    
                if (prescriptionDetail.patientId === 0) {
                    // Prepare generalPrescriptionDetail using prescriptionDetail data
                    generalPrescriptionDetail = {
                        name: prescriptionDetail.patientName,
                        email: prescriptionDetail.patientEmail,
                        phone: prescriptionDetail.phone,
                        age: prescriptionDetail.age,
                        gender: prescriptionDetail.gender,
                        height: prescriptionDetail.height,
                        weight: prescriptionDetail.weight,
                        location: prescriptionDetail.location,
                        prescriptionId: prescription.id, // Set the newly created prescription id
                        isActive: true,
                        emailSent: 'sent'
                    };
                    
                    // Create new general prescription record
                    await PatientGeneralPrescription.create(generalPrescriptionDetail);
                }
            }
        
            // Ensure medicineDetail has the prescriptionId
            if (prescription.id && Array.isArray(medicineDetail) && medicineDetail.length > 0) {
                const updatedMedicineDetail = medicineDetail.map(item => ({
                    ...item,
                    prescriptionId: prescription.id
                }));
    
                // Save the prescription medications
                await this.savePrescriptionMedication(prescription, updatedMedicineDetail);
            }
            // if(prescriptionDetail.appointmentId){
            //     await Appointment.update(
            //         { status: 2 },
            //         {
            //             where: {
            //                 id: prescriptionDetail.appointmentId
            //             }
            //         }
            //     );   
            // }
            return prescription;
        } catch (error) {
            throw new Error("Error while updating or creating prescription details");
        }
    }    

    static async savePrescriptionMedication(prescription, medicineDetail) {
        try {
            if (prescription.id) {    
                // Check if record exists
                const existingMedicines = await MedicinePrescribed.findAll({
                    where: {
                        prescriptionId: prescription.id
                    },
                });

                // Delete existing records if found
                if (existingMedicines.length > 0) {
                    await MedicinePrescribed.destroy({
                        where: {
                            prescriptionId: prescription.id
                        },
                    });
                }
    
                // Create new records in bulk
                await MedicinePrescribed.bulkCreate(medicineDetail);
                return true;
            }
            throw new Error("Error while updating or creating prescription medication");
        } catch (error) {
            throw new Error("Error while updating or creating prescription medication");
        }
    }    
    
    static async savePrescription(pdfLink, prescriptionDetail) {
        try {
            const data = {
                "prescription_json" : prescriptionDetail,
                "prescriptionURL" : pdfLink,
                "prescriptionId" : prescriptionDetail.prescriptionUniqueId,
                "doctor_id" : prescriptionDetail.doctor.id,
                "appointmentId" : prescriptionDetail.appointmentId
            };
            // Create new records in bulk
            await Prescription.create(data);
            let folderExists;
            if(prescriptionDetail.patientId != 0){
                folderExists = await PatientFolder.findOne({ where: { folderName : "Prescriptions", patientId: prescriptionDetail.patientId } });
                if(!folderExists){
                    const patientFolder = {
                        "patientId" : prescriptionDetail.patientId,
                        "folderName" : 'Prescriptions',
                        "folderType" : 1
                    };
                    folderExists = await PatientFolder.create(patientFolder);
                }
                const doctorid =  prescriptionDetail.doctor.id;
                const doctorDetails = await Doctor.findOne({ where: { id: doctorid } });
                if(doctorDetails){
                    const patientFile = {
                        "patientId" : prescriptionDetail.patientId,
                        "folderId" : folderExists.id,
                        "fileName" : `${doctorDetails.name}_${new Date().toISOString().split('T')[0]}`,
                        "fileType" : 1,
                        "fileUrl" : pdfLink,
                        "status" : 1
                    };
                    await PatientFile.create(patientFile);   
                }
            }
            return true;
        } catch (error) {
            throw new Error("Error while saving prescription");
        }
    }  

    static async getMedicineDetails(patientId, appointmentId) {
        try {
            // Fetch all records exists
            const existingMedicines = await MedicinePrescribed.findAll({
                where: {
                    patientId: patientId,
                    appointmentId: appointmentId,
                },
            });
            return existingMedicines;
        } catch (error) {
            throw new Error("Error while getting prescription medication");
        }
    }

    static async getPrescriptionDetail(cid) {
        try {
            // Fetch all records exists
            try {
                const [results] = await sequelizeDB1.query(
                    `SELECT doctor_instruction
                     FROM patient_record
                     WHERE id = :cid`,
                    {
                        replacements: { cid },
                        type: sequelizeDB1.QueryTypes.SELECT
                    }
                );                
                return results;
            } catch (error) {
                console.error('Error fetching prescription details:', error);
                throw error;
            }
        } catch (error) {
            throw new Error("Error while getting prescription medication");
        }
    }

    static async getPrescriptionData(prescriptionId) {
        try {
            // Fetch the prescription data
            const query = `
            SELECT
                ppd.id,
                ppd.previousHistory,
                ppd.diagnosis,
                ppd.labFindings,
                ppd.suggestedInvestigations,
                ppd.specialInstructions,
                ppd.chiefComplaints,
                ppd.patientId,
                ppd.appointmentId,
                ppd.signature,
                ppd.doctorEmail,
                ppd.patientEmail,
                ppd.prescriptionUniqueId
            FROM
                patientPrescriptionDetails AS ppd
            WHERE
                ppd.id = :prescriptionId;
            `;
        
            const prescriptionData = await sequelizeDB1.query(query, {
            replacements: { prescriptionId },
            type: QueryTypes.SELECT
            });
        
            if (prescriptionData.length === 0) {
            throw new Error('Prescription not found');
            }
        
            const prescriptionDetails = prescriptionData[0];
            const patientId = prescriptionDetails.patientId;
            const doctorEmail = prescriptionDetails.doctorEmail;
        
            // Determine the source of patient data
            let patientData = {};
            if (patientId === 0 || patientId === null) {
            // Fetch patient details from PatientGeneralPrescription
            patientData = await sequelizeDB1.query(`
                SELECT
                name,
                email,
                phone,
                age,
                gender,
                height,
                weight,
                location
                FROM
                patientGeneralPrescription
                WHERE
                prescriptionId = :prescriptionId
            `, {
                replacements: { prescriptionId },
                type: QueryTypes.SELECT
            });
            } else {
            // Fetch patient details from Patient table
            patientData = await sequelizeDB1.query(`
            SELECT
                p.first_name AS name,
                p.email,
                p.phone,
                pd.age,
                p.gender,
                p.address1 AS location
            FROM
                patient p
            JOIN
                patientDetails pd ON p.id = pd.patientId
            WHERE
                p.id = :patientId;
        
            `, {
                replacements: { patientId },
                type: QueryTypes.SELECT
            });
            }
        
            // Fetch doctor details
            const doctorData = await sequelizeDB1.query(`
            SELECT
                id,
                name,
                email,
                speciality,
                reg_no
            FROM
                doctor
            WHERE
                email = :doctorEmail
            `, {
            replacements: { doctorEmail },
            type: QueryTypes.SELECT
            });
        
            const medicineQuery = `
            SELECT
                mp.id AS medicineId,
                mp.medicineName,
                mp.frequency,
                mp.duration,
                mp.drugForm,
                mp.strength,
                mp.instructions
            FROM
                medicinePrescribed AS mp
            WHERE
                mp.prescriptionId = :prescriptionId;
            `;
        
            const medicinesData = await sequelizeDB1.query(medicineQuery, {
            replacements: { prescriptionId },
            type: QueryTypes.SELECT
            });

            // Structure the response data
            const structuredData = {
            details: {
                ...prescriptionDetails,
                patient: patientData[0] || {},
                doctor: doctorData[0] || {}
            },
            medicines: medicinesData.map(item => ({
                medicineId: item.medicineId,
                medicineName: item.medicineName,
                frequency: item.frequency,
                duration: item.duration,
                drugForm: item.drugForm,
                strength: item.strength,
                instructions: item.instructions
            })).filter(item => item.medicineId) // Filter out any null values
            };
        
            return structuredData;
        } catch (error) {
            console.error('Error fetching prescription data:', error);
            throw error;
        }
    }      

    /**
     * SEC-013: previously `update(data, { where: { patientId: data.patientId } })`
     * - the untrusted body supplied both the values and the target row. The
     * patientId is now an authorised argument, and only allow-listed columns are
     * written.
     */
    static async updateProfile(patientId, data) {
        const ALLOWED = ['medications', 'health_problems', 'medical_allergies', 'symptoms',
                         'height', 'weight', 'bloodGroup', 'profile_image'];
        const values = {};
        for (const key of ALLOWED) {
            if (data[key] !== undefined) values[key] = data[key];
        }

        let response={};
        await PatientDetail.update(values, { where: { patientId }, fields: ALLOWED });
        const patientDetail = await PatientDetail.findOne({ where: { patientId } });
        if (patientDetail) {
            response = {
                "medications" : patientDetail.medications,
                "health_problems" : patientDetail.health_problems,
                "allergies" : patientDetail.medical_allergies,
                "symptoms" : patientDetail.symptoms
            };
        }
        return response;
    }

    static async getAllPatients(search, filter,careCompanyIds) {  
        let query = `
            SELECT 
                p.id AS patientId,
                p.uniquePatientId,
                CONCAT(p.first_name, ' ', p.last_name) AS patientName,
                p.phone,
                wc.company_name AS companyName,
                cp.packageName,
                pd.profile_image AS profilePic
            FROM 
                patient p
            JOIN 
                connectedCompaniesPatient ccp ON p.id = ccp.patientId
            JOIN 
                worksman_company_list wc ON ccp.companyId = wc.id
            JOIN 
                patientDetails pd ON p.id = pd.patientId
            LEFT JOIN 
                carePlans cp ON ccp.companyId = cp.companyId
            WHERE 
                p.isProfileCompleted = 1
                AND ccp.connectionType = 1
                AND ccp.status = 1
                AND ccp.isActive = true
               AND p.employer_id IN (${toIdList(careCompanyIds, 'company id')}) 
        `;
    
        // Add package filter if provided
        if (filter) {
            query += ` AND cp.id = :filter`;
        }
    
        // Add search conditions if provided
        if (search) {
            query += ` AND (
                p.uniquePatientId LIKE :search OR
                CONCAT(p.first_name, ' ', p.last_name) LIKE :search OR
                wc.company_name LIKE :search OR
                cp.packageName LIKE :search
            )`;
        }
        query += `GROUP BY p.id,p.uniquePatientId, p.phone, cp.packageName,companyName,profilePic`;
        const replacements = {};
    
        if (filter) {
            replacements.filter = filter;
        }
    
        if (search) {
            replacements.search = `%${search}%`;
        }
       
        const userDetails = await sequelizeDB1.query(query, {
            type: QueryTypes.SELECT,
            replacements,
        });
    
        return userDetails;
    }    

    static async getMyPatients(search, filter,careCompanyIds) {  
        let query = `
            SELECT 
                p.id AS patientId,
                p.uniquePatientId,
                CONCAT(p.first_name, ' ', p.last_name) AS patientName,
                p.phone,
                wc.company_name AS companyName,
                cp.packageName,
                pd.profile_image AS profilePic
            FROM 
                patient p
            JOIN 
                connectedCompaniesPatient ccp ON p.id = ccp.patientId
            JOIN 
                worksman_company_list wc ON ccp.companyId = wc.id
            JOIN 
                patientDetails pd ON p.id = pd.patientId
            LEFT JOIN 
                carePlans cp ON ccp.companyId = cp.companyId
            WHERE 
                p.isProfileCompleted = 1
                AND ccp.status = 1
                AND ccp.isActive = true
                AND p.employer_id IN (${toIdList(careCompanyIds, 'company id')})
        `;
    
        // Add package filter if provided
        if (filter) {
            query += ` AND cp.id = :filter`;
        }
    
        // Add search conditions if provided
        if (search) {
            query += ` AND (
                p.uniquePatientId LIKE :search OR
                CONCAT(p.first_name, ' ', p.last_name) LIKE :search OR
                wc.company_name LIKE :search OR
                cp.packageName LIKE :search
            )`;
        }
     query += `GROUP BY p.id,p.uniquePatientId, p.phone, cp.packageName,companyName,profilePic`;
        const replacements = {};
    
        if (filter) {
            replacements.filter = filter;
        }
    
        if (search) {
            replacements.search = `%${search}%`;
        }
    
        const userDetails = await sequelizeDB1.query(query, {
            type: QueryTypes.SELECT,
            replacements,
        });
    
        return userDetails;
    }

    static async getPatientCount(careCompanyIds) {  
        let query = `
          SELECT 
            COUNT(*) AS totalPatients
          FROM 
            patient p
          JOIN 
            connectedCompaniesPatient ccp ON p.id = ccp.patientId
          WHERE 
            p.isProfileCompleted = 1
            AND ccp.connectionType = 1
            AND ccp.status = 1
            AND ccp.isActive = true
            AND p.employer_id IN (${toIdList(careCompanyIds, 'company id')})
        `;
    
        const result = await sequelizeDB1.query(query, {
            type: QueryTypes.SELECT,
        });
    
        // Since COUNT(*) returns a single row, we can return the count directly
        return result[0]?.totalPatients || 0;
    }

    static async getMyPatientCount(careCompanyIds) {  
        let query = `
          SELECT 
            COUNT(*) AS totalPatients
          FROM 
            patient p
          JOIN 
            connectedCompaniesPatient ccp ON p.id = ccp.patientId
          WHERE 
            p.isProfileCompleted = 1
            AND ccp.status = 1
            AND ccp.isActive = true
            AND p.employer_id IN (${toIdList(careCompanyIds, 'company id')})
        `;
    
        const result = await sequelizeDB1.query(query, {
            type: QueryTypes.SELECT,
        });
    
        // Since COUNT(*) returns a single row, we can return the count directly
        return result[0]?.totalPatients || 0;
    }

    // SEC-013: same fix as updateProfile - only `notes` is writable here.
    static async updateNotes(patientId, data) {
        let response={};
        await PatientDetail.update({ notes: data.notes }, { where: { patientId }, fields: ['notes'] });
        const patientDetail = await PatientDetail.findOne({ where: { patientId } });
        if (patientDetail) {
            response = {
                "notes" : patientDetail.notes
            };
        }
        return response;
    }
    
    static async getPackages() {  

        const packages = await CarePlan.findAll({
            where: {
                isActive: true,
                isPaid : true
            },
            attributes : ['id', 'packageName']
        });
        
        return packages;
    }
    // check and create origin company
    static async createOrCheckEmployee(company_name, company_address, parent_id){
       // Step 1: Check if company exists      
        const query = `
        SELECT 
            id 
        FROM 
            worksman_company_list wl         
        WHERE 
            wl.active = 1 AND wl.company_name = :company_name
        `;
        const replacements = { company_name };
        // if(parent_id != 0){
        //     query += ' AND parent_id = :parent_id';
        //     replacements.parent_id = parent_id;
        // }       
        const result = await sequelizeDB1.query(query, {
        type: QueryTypes.SELECT,
        replacements
        });     
        // Step 2: If not found, insert new company
        if (result.length === 0) {
            const insertQuery = `
                INSERT INTO 
                worksman_company_list
                (company_name, parent_id,company_address)
                VALUES
                (:company_name, :parent_id, :company_address)
            `;

            const insertReplacements = {
                company_name,
                company_address,
                parent_id
            };

           const [insertResult] = await sequelizeDB1.query(insertQuery, {
                type: QueryTypes.INSERT,
                replacements: insertReplacements
            });
            
            return insertResult;
        }
        return result[0].id;
    }
    // static compay
    static async createOrCheckPatient(employee_name,email,employee_mobile,company_id,uuid,hash_password,company_name,company_address,befor_email_valid,validate_token){
        //check email and mobile for the patient       
        const user = await Patient.findOne({ where: { email } });
        const patientEmail = email;
        const connectedUser = await ConnectedCompaniesPatient.findOne({ where: { patientEmail } });
       // console.log(user);
        const role = 1;   
        if (user && connectedUser) {
            return 1;
        }else{

            const uniqueId = Number(randomDigits(6)).toString();

            if(befor_email_valid == 0){
                        const insertQuery = `INSERT INTO 
                                connectedCompaniesPatient
                            SET 
                                connectionType = 1,
                                companyId = :company_id,
                                patientEmail = :email,
                                mobile_no = :employee_mobile,
                                first_name = :employee_name,
                                password = :hash_password,
                                uniquePatientId = :uniqueId,
                                status = 1,
                                isActive = 1
                            `;

                        const insertReplacements = {
                            company_id,
                            email,
                            employee_mobile,
                            employee_name,
                            hash_password,
                            uniqueId
                    
                        };

                        const [insertResult] = await sequelizeDB1.query(insertQuery, {
                                type: QueryTypes.INSERT,
                                replacements: insertReplacements
                            });  
            
                        // inser patient
                        const query = `INSERT INTO 
                                            patient
                                        SET 
                                            uuid = :uuid,                             
                                            companyId = :company_id,
                                            email = :email,
                                            phone  = :employee_mobile,
                                            first_name = :employee_name,
                                            role = 'Patient',                             
                                            password = :hash_password,
                                            signup_company_name = :company_name,
                                            signup_company_address = :company_address,
                                            employer_id = :company_id,
                                            uniquePatientId = :uniqueId
                                        `;

                            const replacements = {
                                company_id,
                                email,
                                employee_mobile,
                                employee_name,
                                uuid,
                                hash_password,
                                company_name,
                                company_address,
                                uniqueId
                            };

                        const [lastId] = await sequelizeDB1.query(query, {
                                type: QueryTypes.INSERT,
                                replacements: replacements
                            }); 
                //update connected patient
                if(lastId){
                    const queryUpdate = `UPDATE  
                                    connectedCompaniesPatient
                                SET 
                                    patientId = :lastId
                                WHERE
                                    companyId=:company_id
                                AND
                                    patientEmail = :email       
                                AND 
                                    mobile_no=:employee_mobile 
                                `;

                        const replacementsUpdate = {
                            company_id,
                            email,
                            employee_mobile,
                            lastId
                        
                        };
                    const [update] = await sequelizeDB1.query(queryUpdate, {
                        type: QueryTypes.UPDATE,
                        replacements: replacementsUpdate
                    }); 
                }
                const patient =[];
                return lastId;
            }else{
                // inser data in temporary table

                  const query = `INSERT INTO 
                                            patient_before_email_valid
                                        SET 
                                            uuid = :uuid,                             
                                            companyId = :company_id,
                                            email = :email,
                                            employee_mobile  = :employee_mobile,
                                            first_name = :employee_name, 
                                            password = :hash_password,
                                            company_name = :company_name,
                                            company_address = :company_address,
                                            status = 0,
                                            validate_token = :validate_token
                                        `;

                            const replacements = {
                                company_id,
                                email,
                                employee_mobile,
                                employee_name,
                                uuid,
                                hash_password,
                                company_name,
                                company_address,
                                validate_token
                            };

                        const [lastId] = await sequelizeDB1.query(query, {
                                type: QueryTypes.INSERT,
                                replacements: replacements
                            }); 

                const patient =[];
                return lastId;
            }
        }      
      
    }
   
    // get company details by employer id
    static async getCompanyDetails(employer_id){
        // Step 1: Check if company exists      
        const query = `
        SELECT 
            * 
        FROM 
            worksman_company_list wl         
        WHERE 
            wl.active = 1 AND wl.employer_id = :employer_id
        `;
        const replacements = { employer_id };
        const result = await sequelizeDB1.query(query, {
        type: QueryTypes.SELECT,
        replacements
        });   
        return result;  
    }
    // get child company details by its client id (employer_id) under a given parent company id
    static async getCompanyDetailsByParent(employer_id, parent_id){
        const query = `
        SELECT
            *
        FROM
            worksman_company_list wl
        WHERE
            wl.active = 1 AND wl.employer_id = :employer_id AND wl.parent_id = :parent_id
        `;
        const replacements = { employer_id, parent_id: String(parent_id) };
        const result = await sequelizeDB1.query(query, {
        type: QueryTypes.SELECT,
        replacements
        });
        return result;
    }
    // create patient for the sso client login (no email verification, identity is trusted by the client)
    static async createSsoPatient(first_name, last_name, email, mobile, company_id, uuid, hash_password){
        const uniqueId = Number(randomDigits(6)).toString();
        const connectedUser = await ConnectedCompaniesPatient.findOne({ where: { patientEmail : email, companyId : company_id } });

        if(!connectedUser){
            const insertQuery = `INSERT INTO
                    connectedCompaniesPatient
                SET
                    connectionType = 1,
                    companyId = :company_id,
                    patientEmail = :email,
                    mobile_no = :mobile,
                    first_name = :first_name,
                    password = :hash_password,
                    uniquePatientId = :uniqueId,
                    status = 1,
                    isActive = 1
                `;

            const insertReplacements = {
                company_id,
                email,
                mobile,
                first_name,
                hash_password,
                uniqueId
            };

            await sequelizeDB1.query(insertQuery, {
                type: QueryTypes.INSERT,
                replacements: insertReplacements
            });
        }

        // insert patient
        const query = `INSERT INTO
                            patient
                        SET
                            uuid = :uuid,
                            companyId = :company_id,
                            email = :email,
                            phone  = :mobile,
                            first_name = :first_name,
                            last_name = :last_name,
                            role = 'Patient',
                            password = :hash_password,
                            employer_id = :company_id,
                            uniquePatientId = :uniqueId
                        `;

        const replacements = {
            company_id,
            email,
            mobile,
            first_name,
            last_name,
            uuid,
            hash_password,
            uniqueId : connectedUser ? connectedUser.uniquePatientId : uniqueId
        };

        const [lastId] = await sequelizeDB1.query(query, {
            type: QueryTypes.INSERT,
            replacements: replacements
        });

        // update connected patient with the newly created patient id
        if(lastId){
            const queryUpdate = `UPDATE
                            connectedCompaniesPatient
                        SET
                            patientId = :lastId
                        WHERE
                            companyId=:company_id
                        AND
                            patientEmail = :email
                        `;

            const replacementsUpdate = {
                company_id,
                email,
                lastId
            };

            await sequelizeDB1.query(queryUpdate, {
                type: QueryTypes.UPDATE,
                replacements: replacementsUpdate
            });
        }

        return lastId;
    }
    // get temporary patient details
    static async getTempPatientDetails(id){
          const query = `
            SELECT 
                * 
            FROM 
                patient_before_email_valid tp         
            WHERE 
                tp.id = :id
            AND 
                tp.status = 0
            `;
        const replacements = { id };
        const result = await sequelizeDB1.query(query, {
        type: QueryTypes.SELECT,
        replacements
        });   
        return result;  
    }
    // update status of the temporary user
    static async updateStatusTempPatient(id){
          const query = `
            UPDATE  
               patient_before_email_valid tp
            SET 
                tp.status = 1        
            WHERE 
                tp.id = :id
            `;
        const replacements = { id };
        const result = await sequelizeDB1.query(query, {
        type: QueryTypes.UPDATE,
        replacements
        });   
        return result;
    }  
    
      // assign patient to doctor
    static async assignedDoctorToPatient(doctorId, patientId){
        const query = `INSERT INTO 
                patientCareTeam
            SET 
                patientId = :patientId,                             
                doctorId = :doctorId             
            `;
            const replacements = {
                patientId,
                doctorId               
            };
            const [lastId] = await sequelizeDB1.query(query, {
                type: QueryTypes.INSERT,
                replacements: replacements
            }); 

    }
}

module.exports = PatientService;
