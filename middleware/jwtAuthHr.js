const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secret');
const messages = require('../config/language').messages;
const { STATUS_CODE } = require('../config/constant');

const jwtAuthHr = (req, res, next) => {
    const role = req.header('role') || null;
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenNotFound });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        if(role != req.user.role){
            return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenInvalid });
        }
        next();
    } catch (error) {
        res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenInvalid });
    }
};

module.exports = jwtAuthHr;
