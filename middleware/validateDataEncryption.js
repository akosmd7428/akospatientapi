const { decryptData } = require('../config/encryption');
const CommonHelper = require('../helpers/commonHelper');
const { STATUS_CODE } = require('../config/constant');

const decryptPayload = (payload) => {
  if (!payload || typeof payload.encryptedData !== 'string' || typeof payload.IV !== 'string') {
    throw new Error('Missing encrypted payload');
  }
  const parsed = JSON.parse(decryptData(payload.encryptedData, payload.IV));
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Invalid encrypted payload');
  }
  return parsed;
};

const validateDataEncryption = () => {
  return (req, res, next) => {
    try {
      if (Object.keys(req.params).length != 0 && req.params.encryptedData != null) {
        req.params = decryptPayload(req.params);
      }
      if (req.body && Object.keys(req.body).length != 0) {
        req.body = decryptPayload(req.body);
      }
      if (Object.keys(req.query).length != 0) {
        req.query = decryptPayload(req.query);
      }
    } catch (error) {
      return CommonHelper.sendError(res, STATUS_CODE.HTTP_400_BAD_REQUEST, 'Invalid request payload');
    }
    next();
  };
};

module.exports = validateDataEncryption;
