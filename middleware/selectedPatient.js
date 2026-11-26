const { QueryTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const { STATUS_CODE } = require('../config/constant');

const selectedPatient = async (req, res, next) => {
    if (!req.user || !req.user.id) {
        return next();
    }

    const headerVal = req.header('x-selected-patient-id');
    const selectedId = headerVal ? Number(headerVal) : null;

    if (!selectedId || selectedId === req.user.id) {
        req.selectedPatientId = req.user.id;
        return next();
    }

    try {
        const loginPatient = await sequelizeDB1.query(
            'SELECT id, parent_id FROM patient WHERE id = :id LIMIT 1',
            { type: QueryTypes.SELECT, replacements: { id: req.user.id } }
        );
        if (!loginPatient.length) {
            req.selectedPatientId = req.user.id;
            return next();
        }

        const loginRow = loginPatient[0];
        const isLoginDependent = Number(loginRow.parent_id) > 0;
        const familyRoot = isLoginDependent ? loginRow.parent_id : loginRow.id;

        const member = await sequelizeDB1.query(
            'SELECT id FROM patient WHERE id = :selectedId AND (id = :familyRoot OR parent_id = :familyRoot) LIMIT 1',
            { type: QueryTypes.SELECT, replacements: { selectedId, familyRoot } }
        );

        if (member.length) {
            req.selectedPatientId = selectedId;
        } else {
            return res.status(STATUS_CODE.HTTP_403_FORBIDDEN).send({
                success: false,
                message: 'Selected patient is not a member of your family. Access denied.',
            });
        }
    } catch {
        req.selectedPatientId = req.user.id;
    }

    next();
};

module.exports = selectedPatient;
