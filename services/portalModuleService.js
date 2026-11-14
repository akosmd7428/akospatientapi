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

    // settings (and logo) of the patient's company (patient.companyId), returned as an array;
    // SELECT * so a database without one of these columns still works (the value is null then)
    static async getCompanySettingsForPatient(patientId) {
        const rows = await sequelizeDB1.query(
            `SELECT c.*
            FROM patient p
            INNER JOIN worksman_company_list c ON c.id = p.companyId
            WHERE p.id = :patientId
            LIMIT 1`,
            { replacements: { patientId }, type: QueryTypes.SELECT }
        );
        return rows.map(company => ({
            company_id: company.id,
            company_name: company.company_name ?? null,
            company_logo: company.company_logo ?? null,
            is_pament_required: company.is_pament_required ?? null,
            is_profile_complete_required: company.is_profile_complete_required ?? null,
            is_company_logo_show: company.is_company_logo_show ?? null,
            is_plan_id_verify: company.is_plan_id_verify ?? null,
            is_nav_hide: company.is_nav_hide ?? null,
        }));
    }
}

module.exports = PortalModuleService;
