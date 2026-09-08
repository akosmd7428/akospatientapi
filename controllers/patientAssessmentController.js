const PatientAssessmentService = require('../services/patientAssessmentService');
const { sendError, sendSuccess } = require('../helpers/commonHelper');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE, BEHAVIOURAL_HEALTH } = require('../config/constant');
const { messages } = require('../config/language');
const AssessmentQuestion = require('../models/assessmentQuestionModel');
const Assessment = require('../models/assessmentModel');
const AssessmentPatientResponse = require('../models/assessmentPatientResponse');
const AssessmentResponse = require('../models/assessmentResponse');

class PatientAssessmentController {
    static async createPatientAssessment(req, res, next) {
        try {
            const { body } = req;
            // Call service method to create patient assessment
            const patientAssessment = await PatientAssessmentService.createOrUpdatePatientAssessment(body);
            
            return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.assessmentCreated, { patientAssessment });
        } catch (error) {
            return sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.assessmentCreatingError, error.message);
        }
    }

    static async createPatientAssessments(req, res, next) {
        try {
            const { body } = req;
            const { assessmentId, patientId, level, levelName } = req.body;
            let API_URL;
            let finalResponsePercentageMulti;
            let assessmentLevel;
            let transformInputFinalData;
            // let SBP;
            // let DBP;
            if(assessmentId && patientId){
                const assessments = await Assessment.findOne({ where: { id: assessmentId } });
                API_URL = assessments ? assessments.API_URL : null;
                assessmentLevel = assessments ? assessments.totalLevels : null;
            }
            // if(assessmentLevel > 1){ //When multiple levels

            // }
            const transformInput = async (input) => {
                const { assessmentId, patientId, responses } = input;
            
                // Using Promise.all to handle asynchronous operations within the map
                const transformedResponses = await Promise.all(responses.map(async (response) => {
                    // Fetch the assessment question details asynchronously
                    const assessmentQuestion = await AssessmentQuestion.findOne({ where: { id: response.assessmentQuestionId } });
                    // Return the transformed object
                    // if(response.assessmentQuestionId == 125 && assessmentId ==1 && assessmentQuestion.paramName == "SBP"){
                    //     SBP = response.assessmentAnswer;
                    // }
                    // if(response.assessmentQuestionId == 126 && assessmentId ==1 && assessmentQuestion.paramName == "DBP"){
                    //     DBP = response.assessmentAnswer;
                    // }
                    return {
                        levelName:assessmentQuestion.levelName,
                        assessmentId: assessmentId,
                        assessmentQuestionId: response.assessmentQuestionId,
                        assessmentParam: assessmentQuestion.paramName,
                        assessmentAnswer: response.assessmentAnswer,
                        patientId: patientId
                    };
                }));
            
                return transformedResponses;
            };  
            
            const transformInputData = await transformInput(body);
            // Call service method to create multiple patient assessments
            await PatientAssessmentService.createPatientAssessments(transformInputData);
            
            const transformInputFinal = async (input) => {
                const { responses } = input;
            
                // Using Promise.all to handle asynchronous operations within the map
                const transformedResponses = await Promise.all(
                    responses.map(async (response) => {
                        // Fetch the assessment question details asynchronously
                        const assessmentQuestion = await AssessmentQuestion.findOne({ where: { id: response.assessmentQuestionId } });
            
                        // Parse the answer to number if it is numeric, otherwise leave it as is
                        const parsedAnswer = isNaN(response.assessmentAnswer) ? response.assessmentAnswer : Number(response.assessmentAnswer);
            
                        // Return an object with paramName as the key and assessmentAnswer as the value
                        return {
                            [assessmentQuestion.paramName]: parsedAnswer
                        };
                    })
                );
            
                // Merge all objects into a single object
                const finalResponse = transformedResponses.reduce((acc, curr) => {
                    return { ...acc, ...curr };
                }, {});
            
                return finalResponse;
            };


            // Function to classify blood pressure
            const classifyBloodPressure = async (assessmentData) => {
                // Initialize variables for SBP and DBP
                let SBP, DBP;
                
                // Extract SBP and DBP values from the data array
                assessmentData.forEach(item => {
                    if (item.assessmentParam === 'SBP') {
                        SBP = parseInt(item.assessmentAnswer, 10); // Convert to integer
                    } else if (item.assessmentParam === 'DBP') {
                        DBP = parseInt(item.assessmentAnswer, 10); // Convert to integer
                    }
                });
                
                // Check if both SBP and DBP are available
                if (SBP !== undefined && DBP !== undefined) {
                    // Classification logic based on JNC 7 guidelines
                    if (SBP < 90 || DBP < 60){
                        return "Hypotension. <br/> Follow up recommendation:<br/> Consult a doctor.<br/>Low blood pressure may indicate an underlying condition";
                    }else if (SBP < 120 && DBP < 80) {
                        return "Normal.<br/>Follow up recommendation:<br/> Recheck in 2 years";
                    } else if ((SBP >= 120 && SBP <= 139) || (DBP >= 80 && DBP <= 89)) {
                        return "Prehypertension.<br/>Follow up recommendation:<br/> Recheck in 1 year";
                    } else if ((SBP >= 140 && SBP <= 159) || (DBP >= 90 && DBP <= 99)) {
                        return "Stage 1 hypertension.<br/>Follow up recommendation:<br/> Confirm diagnosis within 2 months";
                    } else if (SBP >= 160 || DBP >= 100) {
                        return "Stage 2 hypertension.<br/>Follow up recommendation:<br/> Evaluate or refer within 1 month.<br/>For BP >180/110 mmHg, evaluate and treat immediately or within 1 week.<br/>based on the clinical situation and complications. ";
                    } else {
                        return "Unclassifiable";
                    }
                } else {
                    return "Missing Values";
                }
            };

            const transformInputMultipleLevels = async (input) => {
                // const responses = await AssessmentPatientResponse.findAll({
                //     where: { 
                //         assessmentId: assessmentId, 
                //         patientId: patientId 
                //     },
                //     order: [['createdAt', 'DESC']],
                //     // group: ['assessmentQuestionId']
                // });
                const { responses } = input;
            
                // Using Promise.all to handle asynchronous operations within the map
                const transformedResponses = await Promise.all(
                    responses.map(async (response) => {
                        // Fetch the assessment question details asynchronously
                        const assessmentQuestion = await AssessmentQuestion.findOne({ where: { id: response.assessmentQuestionId } });
            
                        // Parse the answer to number if it is numeric, otherwise leave it as is
                        const parsedAnswer = isNaN(response.assessmentAnswer) ? response.assessmentAnswer : Number(response.assessmentAnswer);
            
                        // Return an object with the level and question key/value pair
                        return {
                            level: assessmentQuestion.levelName,
                            question: assessmentQuestion.paramName,
                            answer: parsedAnswer
                        };
                    })
                );
            
                // Group responses by levelName and question
                // let finalResponse = transformedResponses.reduce((acc, curr) => {
                //     // Check if the level already exists in the accumulator object
                //     if (!acc[curr.level]) {
                //         acc[curr.level] = {};
                //     }
            
                //     // Add the question and answer to the respective level
                //     acc[curr.level][curr.question] = curr.answer;
            
                //     return acc;
                // }, {});
                 // Group responses by levelName and question
                let finalResponse = transformedResponses.reduce((acc, curr) => {
                    // Check if the level already exists in the accumulator object
                    if (!acc[curr.level]) {
                        acc[curr.level] = {};
                    }
            
                    // Add the question and answer to the respective level
                    acc[curr.level][curr.question] = curr.answer;
                    
                    return acc;
                }, {});

                const answerValues = {
                    "1": 1,
                    "2": 2,
                    "3": 3,
                    "4": 4,
                    "5": 5
                  };
                  
                finalResponsePercentageMulti = transformedResponses.reduce((acc, curr) => {
                    // Check if the level already exists in the accumulator object
                    if (!acc[curr.level]) {
                      acc[curr.level] = {
                        totalAnswers: 0, // Initialize totalAnswers
                        totalQuestions: 0, // Initialize totalQuestions
                        totalPercentages: 0 // Initialize totalPercentages
                      };
                    }
                    
                    // Check if the answer is valid and mapped to answerValues
                    if (answerValues[curr.answer]) {
                      // Add the answer value to the totalAnswers for the level
                      acc[curr.level].totalAnswers += answerValues[curr.answer];
                      
                      // Increment the total number of questions per level
                      acc[curr.level].totalQuestions += 1;

                      acc[curr.level].totalPercentages = Math.round(((acc[curr.level].totalAnswers*100) / (acc[curr.level].totalQuestions * 5)));
                    }
                  
                    return acc;
                }, {});
               

                finalResponse = {
                    "responses": finalResponse
                };
                return finalResponse;
            };                                   

            if(assessmentLevel == 1){
                transformInputFinalData = await transformInputFinal(body);
            }
            else{
                transformInputFinalData = await transformInputMultipleLevels(body);
            }
            // Call method to get response for the assessments
            if(API_URL && assessmentLevel == level){ 
                const assessmentResponse = await PatientAssessmentService.calculateResponse(API_URL, transformInputFinalData);
                //Save Response into DB
                if(assessmentResponse.data){
                    if(assessmentLevel > 1){
                        const finalMergedResponse = Object.keys(finalResponsePercentageMulti).reduce((acc, key) => {
                            // Add a result key that contains the summary and percentage for each level
                            acc[key] = {
                                result: assessmentResponse.data.summaries[key], // Default to empty string if no summary available
                                percentage: finalResponsePercentageMulti[key].totalPercentages || 0, // Default to 0 if percentage not available
                                maxRange: 100
                            };
                            
                            return acc;
                        }, {});
                            
                        await PatientAssessmentService.savePatientResponse(assessmentId, patientId, finalMergedResponse);
                        return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.assessmentCreated, { assessmentResponse: finalMergedResponse });
                    }else{
                        await PatientAssessmentService.savePatientResponse(assessmentId, patientId, assessmentResponse.data);
                        if(assessmentResponse.data.percentage){
                            assessmentResponse.data.maxRange = 100;
                        }
                        return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.assessmentCreated, { assessmentResponse: assessmentResponse.data });
                    }
                }
                return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.assessmentCreated);
            }
            if(assessmentId == 1){
                const classification = await classifyBloodPressure(transformInputData);
                const result = `Based on your blood pressure readings, your risk prediction is: ${classification}.`;
                await AssessmentResponse.create({
                    assessmentId: assessmentId,
                    response: {result},
                    patientId: patientId,
                });
                return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.assessmentCreated, { assessmentResponse: { result } });
            }
            return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.assessmentCreated);
        } catch (error) {
            return sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.assessmentCreatingError, "Something went wrong!");
        }
    }


    static async createBehaviouralHealth(req, res, next) {
        try {
            const { body } = req;
            // Call service method to create multiple patient assessments
            await PatientAssessmentService.createBehaviouralHealth(body);
            const assessmentResponse = await PatientAssessmentService.calculateSeverity(req.user.id, body);
            assessmentResponse.statement =  BEHAVIOURAL_HEALTH.STRING_BEGIN + assessmentResponse.severity +BEHAVIOURAL_HEALTH.STRING_END;
            return sendSuccess(res, true, STATUS_CODE.HTTP_201_CREATED, messages.assessmentCreated, { assessmentResponse });
        } catch (error) {
            return sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.assessmentCreatingError, error.message);
        }
    }

    static async getPatientAssessments(req, res, next) {
        try {
            const patientId = req.user.id;
            const assessments = await PatientAssessmentService.getPatientAssessments(patientId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.assessmentsFetched, { assessments });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async assessmentTakenByPatient(req, res, next) {
        try {
            const patientId = req.user.id;
            const assessments = await PatientAssessmentService.assessmentTakenByPatient(patientId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.assessmentsFetched, { assessments });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    static async getPatientAssessmentsDetails(req, res, next) {
        try {
            const patientId = req.user.id;
            const { assessmentId } = req.params;
            const assessments = await PatientAssessmentService.getPatientAssessmentsDetails(patientId,assessmentId);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.assessmentsFetched, { assessments });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }
    
}

module.exports = PatientAssessmentController;
