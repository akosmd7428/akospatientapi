const Joi = require('joi');

// verify the one time connect code before giving the connect-api token
const connectVerifyCodeValidation = Joi.object({
    code: Joi.string().hex().length(64).required()
});

module.exports = {
    connectVerifyCodeValidation
};
