const Assessment = require('../models/assessmentModel');
const AssessmentQuestion = require('../models/assessmentQuestionModel');
const AssessmentOption = require('../models/assessmentOptionModel');
const { sequelizeDB1 } = require('../config/sequelize');
class AssessmentService {

  static async getAssessments(type) {

    // const tempData = await Assessment.findOne({
    //     where: { isActive: true, type, id: 7 },
    //     attributes: ['id', 'assessmentName', 'assessmentImage', 'assessmentType', 'totalLevels', 'API_URL']
    // });
    // console.log(tempData,'tempData===');
    // const updatedTempData = await Assessment.update(
    //     { API_URL: 'http://hra-inferencegen-api.centralindia.azurecontainer.io/generate_inference' },  // Set the new value for API_URL
    //     {
    //       where: { id: 7, isActive: true },      // Update the row where id = 7 and isActive = true
    //     }
    //   );
    // console.log(updatedTempData,'updatedTempData===');

    return await Assessment.findAll({
      where: { isActive: true, type },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'assessmentName', 'assessmentImage', 'assessmentType', 'totalLevels']
    });
  }
    
  static async getAssessmentDetails(assessmentId) {
        const query = `
            SELECT 
                aq.id as questionId,
                aq.questions as questionText,
                aq.assessmentOptionType as optionType,
                aq.paramName as paramName,
                aq.isRequired as isRequired,
                aq.level as level,
                aq.levelName as levelName,
                ao.id as optionId,
                ao.options as optionText,
                ao.optionsValue as optionsValue
            FROM 
                assessmentQuestions aq
            LEFT JOIN 
                assessmentOptions ao 
            ON 
                aq.id = ao.assessmentQuestionId 
            AND 
                ao.isActive = 1
            WHERE 
                aq.assessmentId = :assessmentId 
            AND 
                aq.isActive = 1
            AND
                aq.isDisplay = 1
        `;

        const results = await sequelizeDB1.query(query, {
            replacements: { assessmentId },
            type: sequelizeDB1.QueryTypes.SELECT
        });

        const groupedByLevels = {};

        results.forEach(result => {
            if (!groupedByLevels[result.level]) {
                groupedByLevels[result.level] = {
                    level: result.level,
                    levelName: result.levelName,
                    questions: {}
                };
            }

            const levelGroup = groupedByLevels[result.level].questions;

            if (!levelGroup[result.questionId]) {
                levelGroup[result.questionId] = {
                    questionId: result.questionId,
                    questionText: result.questionText,
                    optionType: result.optionType,
                    isRequired: result.isRequired,
                    paramName: result.paramName,
                    options: []
                };
            }

            if (result.optionId) {
                levelGroup[result.questionId].options.push({
                    optionId: result.optionId,
                    optionText: result.optionText,
                    optionsValue: result.optionsValue
                });
            }
        });

        // Convert the grouped object into an array grouped by levels
        return Object.values(groupedByLevels).map(levelGroup => ({
            level: levelGroup.level,
            levelName: levelGroup.levelName,
            questions: Object.values(levelGroup.questions)
        }));
    }

    static async getBehaviouralQuestions(assessmentId) {
        const query = `
            SELECT 
                aq.id as questionId,
                aq.questions as questionText,
                aq.assessmentOptionType as optionType,
                aq.paramName as paramName,
                aq.isRequired as isRequired,
                ao.id as optionId,
                ao.options as optionText,
                ao.optionsValue as optionsValue
            FROM 
                assessmentQuestions aq
            LEFT JOIN 
                assessmentOptions ao 
            ON 
                aq.id = ao.assessmentQuestionId 
            AND 
                ao.isActive = 1
            WHERE 
                aq.assessmentId = :assessmentId 
            AND 
                aq.isActive = 1
        `;
    
        const results = await sequelizeDB1.query(query, {
            replacements: { assessmentId },
            type: sequelizeDB1.QueryTypes.SELECT
        });
    
        const questions = {};
    
        results.forEach(result => {
            if (!questions[result.questionId]) {
                questions[result.questionId] = {
                    questionId: result.questionId,
                    questionText: result.questionText,
                    optionType: result.optionType,
                    isRequired: result.isRequired,
                    paramName: result.paramName,
                    options: []
                };
            }
            if (result.optionId) {
                questions[result.questionId].options.push({
                    optionId: result.optionId,
                    optionText: result.optionText,
                    optionsValue: result.optionsValue
                });
            }
        });
    
        return Object.values(questions);
    }


}

module.exports = AssessmentService;
