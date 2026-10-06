const { sequelizeDB1 } = require('../config/sequelize');
const { QueryTypes } = require('sequelize');

class PortalModuleService {
    // Active portal modules for the patient's company.
    // A module is shown when it is active (status = 1) and not disabled for the company;
    // a module without a permission row for the company is treated as enabled.
    static async getActiveModulesForPatient(patientId) {
        const query = `
            SELECT
                m.id,
                m.module_name,
                m.module_key,
                m.sort_order
            FROM patient p
            INNER JOIN patient_portal_module m ON m.status = 1
            LEFT JOIN patient_portal_module_permission pm
                ON pm.module_id = m.id AND pm.company_id = p.companyId
            WHERE p.id = :patientId
              AND COALESCE(pm.is_enabled, 1) = 1
            ORDER BY m.sort_order ASC, m.id ASC;
        `;
        return sequelizeDB1.query(query, {
            replacements: { patientId },
            type: QueryTypes.SELECT
        });
    }
}

module.exports = PortalModuleService;
