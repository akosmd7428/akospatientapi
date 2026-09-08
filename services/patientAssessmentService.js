const Assessment = require('../models/assessmentModel');
const PatientAssessment = require('../models/patientAssessment');
const HealthScoreCalculation = require('../models/healthScoreCalculation');
const HealthAssessmentResult = require('../models/healthAssessmentResult');
const { sequelizeDB1 } = require('../config/sequelize');
const { messages } = require('../config/language');
const { Op } = require('sequelize');
const AssessmentPatientResponse = require('../models/assessmentPatientResponse');
const axios = require('axios');
const AssessmentResponse = require('../models/assessmentResponse');

class PatientAssessmentService {
    static async createOrUpdatePatientAssessment(data) {
        try {
            if (data.id) {
                // If 'id' is provided, update the existing record
                const updatedPatientAssessment = await PatientAssessment.update(data, {
                    where: { id: data.id },
                    returning: true, // Return the updated record
                });
                if (updatedPatientAssessment[0] === 0) {
                    throw new Error('Patient assessment not found');
                }
                return updatedPatientAssessment[1][0]; // Return the updated patient assessment
            } else {
                // If 'id' is not provided, create a new record
                const newPatientAssessment = await PatientAssessment.create(data);
                return newPatientAssessment;
            }
        } catch (error) {
            throw new Error('Error creating or updating patient assessment');
        }
    }


    static async createPatientAssessments(data) {
        try {
            
            const patientAssessments = await AssessmentPatientResponse.bulkCreate(data);
            return patientAssessments;
        } catch (error) {
            throw new Error(messages.assessmentCreatingError);
        }
    }

    static async createBehaviouralHealth(data) {
        try {
            
            const patientAssessments = await PatientAssessment.bulkCreate(data);
            return patientAssessments;
        } catch (error) {
            throw new Error(messages.assessmentCreatingError);
        }
    }

    static async getPatientAssessments(patientId) {
        const query = `
            SELECT 
                pa.id AS patientAssessmentId,
                pa.patientId,
                a.assessmentName,
                a.assessmentType,
                a.assessmentImage,
                ar.response
            FROM 
                patientAssessment pa
            JOIN 
                assessments a ON pa.assessmentId = a.id
            LEFT JOIN 
                assessmentResponse ar ON pa.assessmentId = ar.assessmentId AND ar.patientId = :patientId
            WHERE 
                pa.patientId = :patientId
        `;
    
        const results = await sequelizeDB1.query(query, {
            replacements: { patientId },
            type: sequelizeDB1.QueryTypes.SELECT
        });
    
        return results;
    }

    static async getPatientAssessmentsDetails(patientId, assessmentId) {
        const query = `
            SELECT 
                pa.id AS patientAssessmentId,
                pa.patientId,
                a.assessmentName,
                a.assessmentType,
                a.totalLevels,
                a.assessmentImage,
                ar.createdAt AS completedDate,
                ar.response
            FROM 
                assessmentPatientResponse pa
            JOIN 
                assessments a ON pa.assessmentId = a.id
            LEFT JOIN 
                assessmentResponse ar ON pa.assessmentId = ar.assessmentId AND ar.patientId = :patientId
            WHERE 
                pa.patientId = :patientId AND ar.assessmentId = :assessmentId
            ORDER BY
                ar.id DESC
            LIMIT 1
        `;
    
        const results = await sequelizeDB1.query(query, {
            replacements: { patientId, assessmentId },
            type: sequelizeDB1.QueryTypes.SELECT
        });
    
        const assessments = {};
    
        results.forEach(result => {
            if (!assessments[result.patientAssessmentId]) {
                assessments[result.patientAssessmentId] = {
                    id: result.patientAssessmentId,
                    assessmentId: assessmentId,
                    patientId: result.patientId,
                    assessmentName: result.assessmentName,
                    assessmentType: result.assessmentType,
                    totalLevels: result.totalLevels,
                    assessmentImage: result.assessmentImage,
                    assessmentTaken: [],
                    timeline: []
                };
            }
    
            if (result.response) {
                const response = result.response;
                assessments[result.patientAssessmentId].assessmentTaken.push({
                    completedDate: new Date(result.completedDate).toLocaleDateString('en-GB'), // Format as dd/mm/yyyy
                    response: response,
                    maxRange: 100
                });
            }
        });
    
        // Convert the assessmentTaken array to descending order by completedDate
        for (const assessmentId in assessments) {
            assessments[assessmentId].assessmentTaken.sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
            
            // Prepare the timeline data
            assessments[assessmentId].timeline = assessments[assessmentId].assessmentTaken.map(entry => ({
                date: entry.completedDate,
                percentage: entry.response.percentage ? entry.response.percentage : 0,
                maxRange: 100
            }));
        }
    
        return Object.values(assessments);
    };
    
    static async assessmentTakenByPatient(patientId) {
        const query = `
            SELECT 
                ar.assessmentId,
                a.assessmentName,
                a.assessmentType,
                a.assessmentImage
            FROM 
                assessmentResponse ar
            JOIN 
                assessments a ON ar.assessmentId = a.id
            WHERE 
                ar.patientId = :patientId
            GROUP BY 
                ar.assessmentId, a.assessmentName, a.assessmentType, a.assessmentImage
        `;
    
        const results = await sequelizeDB1.query(query, {
            replacements: { patientId },
            type: sequelizeDB1.QueryTypes.SELECT
        });
        if (results.length > 0) {
            results.sort((a, b) => b.assessmentId - a.assessmentId);
        }
        
        return results;
    }

    static async calculateSeverity(patientId, assessmentData) {
        try {
            // Extract all assessmentOptionIds from the input data
            const assessmentOptionIds = assessmentData.map(data => data.assessmentOptionId);
            
            // Convert the assessmentOptionIds array into a comma-separated string
            const idsString = assessmentOptionIds.join(',');

            // Define the raw query to get the total score
            const query = `
                SELECT optionsValue
                FROM assessmentOptions
                WHERE id IN (${idsString})
            `;

            // Execute the raw query
            const result = await sequelizeDB1.query(query, {
                type: sequelizeDB1.QueryTypes.SELECT,
                raw: true,
            });

            let totalScore = 0;
            let severityRecord = '';
            for (let i = 0; i < result.length; i++) {
                totalScore += parseInt(result[i].optionsValue, 10);
            }   

            // Fetch the severity from healthScoreCalculation table
            severityRecord = await HealthScoreCalculation.findOne({
                where: {
                    minScore: { [Op.lte]: totalScore },
                    maxScore: { [Op.gte]: totalScore },
                    assessmentId: assessmentData[0].assessmentId,
                },
                attributes: ['depressionSeverity'],
                raw: true,
            });

            // Save the result to healthAssessmentResult table
            await HealthAssessmentResult.create({
                score: totalScore,
                severity: severityRecord ? severityRecord.depressionSeverity : null,
                assessmentId: assessmentData[0].assessmentId,
                patientId: patientId,
            });

            const assessmentDetail =  await Assessment.findOne({
                where: { isActive: true, id: assessmentData[0].assessmentId, type: 2 },
                attributes: ['lastRange'],
            });

            // Return the severity
            return {
                maxRange:   assessmentDetail ? assessmentDetail.lastRange : 0,
                totalScore,
                severity: severityRecord ? severityRecord.depressionSeverity : null,
            };
        } catch (error) {
            throw new Error('Error calculating severity');
        }
    }

    static async calculateResponse(API_URL, data) {
        try {
            const response = await axios.post(API_URL, data, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            console.log(response,'response================');
            return response;
        } catch (error) {
            console.error('Error:', error.message);
            throw error;
        }
    }

    static async savePatientResponse(assessmentId, patientId, assessmentResponse) {
        try {
            // Cast 'percentage' to number if necessary
            if (assessmentResponse && typeof assessmentResponse.percentage === 'string') {
                assessmentResponse.percentage = Number(assessmentResponse.percentage);
            }
    
            await AssessmentResponse.create({
                assessmentId: assessmentId,
                response: assessmentResponse,
                patientId: patientId,
            });
    
        } catch (error) {
            console.error('Error saving response:', error);
        }
    }    

}

module.exports = PatientAssessmentService;