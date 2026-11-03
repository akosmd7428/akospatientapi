const { authorize, ROLES } = require('./authorize');
const Hr = require('../models/hrModel');
const messages = require('../config/language').messages;
const { STATUS_CODE } = require('../config/constant');

// a valid token is not enough, the hr row must still exist and be active / not deleted
const loadActiveHr = async (req, res, next) => {
    try {
        const hr = await Hr.findByPk(req.user.id, { attributes: ['id', 'isActive', 'isDeleted'] });
        if (!hr || hr.isActive == 0 || hr.isDeleted == 1) {
            return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenInvalid });
        }
        next();
    } catch (error) {
        next(error);
    }
};

// hr portal routes, only an hr login token of an active hr user is accepted
// const jwtAuthHr = authorize(ROLES.HR);
const jwtAuthHr = [authorize(ROLES.HR), loadActiveHr];

module.exports = jwtAuthHr;
