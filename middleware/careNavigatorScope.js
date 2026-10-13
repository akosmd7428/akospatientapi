const { QueryTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const messages = require('../config/language').messages;
const { STATUS_CODE } = require('../config/constant');

// companyId on the care navigator row is a comma separated list of company ids
const parseCompanyIds = (value) => String(value ?? '')
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => Number.isInteger(id) && id > 0);

// load the companies the logged in care navigator manages from the database,
// the companyId header sent by the frontend is never trusted
const loadCareNavigatorScope = async (req, res, next) => {
    try {
        const [careNavigator] = await sequelizeDB1.query(
            'SELECT id, companyId, isActive, isDeleted FROM carenavigator WHERE id = :id LIMIT 1',
            { replacements: { id: req.user.id }, type: QueryTypes.SELECT }
        );
        if (!careNavigator || careNavigator.isActive == 0 || careNavigator.isDeleted == 1) {
            return res.status(STATUS_CODE.HTTP_401_UNAUTHORIZED).send({ message: messages.tokenInvalid });
        }
        const companyIds = parseCompanyIds(careNavigator.companyId);
        // -1 matches no company, keeps "IN (:careCompanyIds)" valid for a navigator without companies
        req.careCompanyIds = companyIds.length ? companyIds : [-1];
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = { loadCareNavigatorScope, parseCompanyIds };
