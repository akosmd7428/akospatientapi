const AssessmentService = require('../services/assessmentService');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');
const ChatStatus = require('../models/chatStatus');
const Chat = require('../models/chat');
const ConnectedCompaniesPatient = require('../models/connectedCompaniesPatient');

class AssessmentController {
  static async getAssessments(req, res, next) {
    try {
       // Truncate both tables
      // await Chat.truncate(); // Clears all records and resets ID
      // await ChatStatus.truncate();
     /* const [updatedRows] = await ConnectedCompaniesPatient.update(
          { patientEmail: "harshita.anand@akosmdtech.com" }, // New email to set
          {
              where: {
                patientEmail: 'h.panday@akosmdtech.com', // Condition to match the existing email
              },
          }
      );
      console.log(updatedRows,'updatedRows===');*/
      // const chatList = await Chat.findAll();
      // console.log(chatList,'chatList===');
      
      const { type } = req.query;
      const assessments = await AssessmentService.getAssessments(type);
      return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.assessmentsFetched, { assessments });
    } catch (error) {
      console.error(error);
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
  }

  static async getAssessmentDetails(req, res, next) {
    try {
      const { assessmentId } = req.params;
      if(assessmentId){
        const questions = await AssessmentService.getAssessmentDetails(assessmentId);
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.assessmentDetailsFetched, { questions });
      }
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.assessmentIdRequired);
    } catch (error) {
      console.error(error);
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
  }

  static async getBehaviouralDetails(req, res, next) {
    try {
      const { assessmentId } = req.params;
      
      if(assessmentId){
        const questions = await AssessmentService.getBehaviouralQuestions(assessmentId);
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.assessmentDetailsFetched, { questions });
      }
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, messages.assessmentIdRequired);
    } catch (error) {
      console.error(error);
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
    }
  }
  
}

module.exports = AssessmentController;
