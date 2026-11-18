const { sequelizeDB1 } = require('../config/sequelize');
const { PATIENT_FRONTEND_URL } = require('../config/secret');
const SubscriptionPlanAvail = require('../models/subscriptionPlanAvail');

const getCarePlanDetailsByCompanyId = async (companyId, patientId) => {

    // ---------------------------------------------------------
    // 1. Fetch patient details
    // ---------------------------------------------------------
    const patientQuery = `
        SELECT 
            p.id AS patientId,
            p.first_name,
            p.last_name,
            p.phone,
            p.dateofbirth,
            p.gender,
            p.city,
            p.state,
            p.zip_code,
            pd.age,
            pd.emergency_contact AS emergency_contact_number,
            pd.bloodgroup AS bloodGroup,
            pd.profile_image AS profileImage
        FROM patient p
        LEFT JOIN patientDetails pd 
            ON p.id = pd.patientId
        WHERE p.id = ?
    `;

    const patientResults = await sequelizeDB1.query(patientQuery, {
        replacements: [patientId],
        type: sequelizeDB1.QueryTypes.SELECT,
    });

    if (!patientResults || patientResults.length === 0) {
        throw new Error("Patient not found.");
    }

    const patientDetails = patientResults[0];


    // ---------------------------------------------------------
    // 2. Fetch care plans and subscription plans
    // ---------------------------------------------------------
    const planQuery = `
        SELECT 
            cp.id AS carePlanId,
            cp.packageName AS planName,
            cp.validFrom,
            cp.validUpto,

            sp.company_package_id AS referenceId,
            sp.planKey,
            sp.planValue,
            sp.planType,
            sp.planTypeValue,
            sp.avail_value,
            sp.is_avail,
            sp.is_package

        FROM carePlans cp

        LEFT JOIN subscriptionPlans sp 
            ON cp.id = sp.packageId

        WHERE 
            cp.companyId = ?
            AND cp.isDeleted = false
            AND sp.isDeleted = false

        ORDER BY cp.id DESC;
    `;

    const planResults = await sequelizeDB1.query(planQuery, {
        replacements: [companyId],
        type: sequelizeDB1.QueryTypes.SELECT,
    });

    if (!planResults || !Array.isArray(planResults)) {
        throw new Error("Query result is not an array or is undefined.");
    }

    if (planResults.length <= 0) {
        return planResults;
    }


    // ---------------------------------------------------------
    // 3. Fetch plan benefits
    // ---------------------------------------------------------
    const carePlanIds = [
        ...new Set(
            planResults
                .map(plan => plan.carePlanId)
                .filter(id => id)
        )
    ];

    let benefitsResults = [];

    if (carePlanIds.length > 0) {

        const benefitsQuery = `
            SELECT 
                carePlanId,
                benefit
            FROM planBenefits
            WHERE 
                isActive = true
                AND carePlanId IN (:carePlanIds);
        `;

        benefitsResults = await sequelizeDB1.query(benefitsQuery, {
            replacements: { carePlanIds },
            type: sequelizeDB1.QueryTypes.SELECT,
        });
    }

    if (!Array.isArray(benefitsResults)) {
        throw new Error("Query result is not an array or is undefined.");
    }


    // ---------------------------------------------------------
    // 4. Fetch ALL existing patient package plans
    // ---------------------------------------------------------
    const existingPlans = await SubscriptionPlanAvail.findAll({
        where: {
            patient_id: patientId,
            company_id: companyId,
            status: 1,
            type: 'package'
        },
        raw: true
    });


    // ---------------------------------------------------------
    // 5. Create map of existing plans
    //
    // Key:
    // care_plan_id + reference_id + planKey
    // ---------------------------------------------------------
    const existingPlanMap = new Map();

    existingPlans.forEach(plan => {

        const key = `${plan.care_plan_id}_${plan.reference_id}_${plan.planKey}`;

        existingPlanMap.set(key, plan);
    });


    // ---------------------------------------------------------
    // 6. Process care plans
    // ---------------------------------------------------------
    const carePlansMap = planResults.reduce((acc, row) => {

        let carePlan = acc[row.carePlanId];

        if (!carePlan) {

            carePlan = {
                carePlanId: row.carePlanId,
                planName: row.planName,
                planBenefits: new Set(),
                validFrom: row.validFrom,
                validUpto: row.validUpto,
                patientPortalLink: PATIENT_FRONTEND_URL,

                patientDetails: {
                    patientId: patientDetails.patientId,
                    patientName:
                        patientDetails.first_name +
                        ' ' +
                        patientDetails.last_name,
                    age: patientDetails.age,
                    dateOfBirth: patientDetails.dateofbirth,
                    gender: patientDetails.gender,
                    phone: patientDetails.phone,
                    emergency_contact_number:
                        patientDetails.emergency_contact_number,
                    bloodGroup: patientDetails.bloodGroup,
                    address:
                        patientDetails.city +
                        ', ' +
                        patientDetails.state,
                    profileImage: patientDetails.profileImage,
                },

                planDetails: {},
            };

            acc[row.carePlanId] = carePlan;
        }


        // -----------------------------------------------------
        // 7. Add unique benefits
        // -----------------------------------------------------
        const benefits = benefitsResults
            .filter(
                benefit =>
                    benefit.carePlanId === row.carePlanId
            )
            .map(benefit => benefit.benefit);

        benefits.forEach(benefit => {
            carePlan.planBenefits.add(benefit);
        });


        // -----------------------------------------------------
        // 8. Find existing patient plan
        // -----------------------------------------------------
        const existingPlanKey =
            `${row.carePlanId}_${row.referenceId}_${row.planKey}`;

        const existingPlan =
            existingPlanMap.get(existingPlanKey);


        // -----------------------------------------------------
        // 9. Process plan details
        // -----------------------------------------------------
        if (row.planKey && row.planValue) {

            if (
                row.planType === '1' ||
                row.planType === '2' ||
                row.planType === '3'
            ) {

                // ---------------------------------------------
                // Package lab tests
                // ---------------------------------------------
                if (
                    row.planKey === 'labTests' &&
                    row.is_package === 1
                ) {
                    carePlan.planDetails['Package ' + row.planKey] = {
                        total: 1,
                        // Existing patient plan availability
                        remaining: existingPlan ? 1 : 0 ,
                        planType: row.planTypeValue,
                        // Optional information
                        isMapped: !!existingPlan,
                        referenceId: row.referenceId,
                    };

                } else {
                    // -----------------------------------------
                    // Normal plan
                    // -----------------------------------------
                    carePlan.planDetails[row.planKey] = {
                        total: parseInt(row.planValue),
                        remaining: existingPlan ? parseInt( existingPlan.status ) : 0,
                        planType: row.planTypeValue,
                        isMapped: !!existingPlan,
                        referenceId: row.referenceId,
                    };
                }

            } else {

                carePlan.planDetails[row.planKey] = {

                    total: parseInt(row.planValue),

                    planType: row.planTypeValue,

                    isMapped: !!existingPlan,
                    referenceId: row.referenceId,
                };
            }
        }

        return acc;

    }, {});
   // const data = JSON.parse(carePlansMap);
   // const lengthPlanDetails = data.length;
    console.log(carePlansMap);
    const values = Object.values(carePlansMap);
    const carePlan = values[values.length -1] || null;
    carePlan.planBenefits = Array.from(carePlan.planBenefits);

    // Check if plan is valid
    const currentDate = new Date();
    const validFromDate = new Date(carePlan.validFrom.split('-').reverse().join('-'));
    const validUptoDate = new Date(carePlan.validUpto.split('-').reverse().join('-'));

    carePlan.isPlanValid = (currentDate >= validFromDate && currentDate <= validUptoDate) ? 1 : 0;

    return carePlan;
};

// today in India as YYYY-MM-DD, the format careplans.validFrom / validUpto are stored in
const todayInIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// careplans dates are stored as YYYY-MM-DD or DD-MM-YYYY (both are in the data), returned as YYYY-MM-DD;
// '' for an empty date (no limit) and null for a date that cannot be read
const planDate = (value) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(text);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return null;
};

/*
 * The care plan with this plan_code, when it may be used by a member of one of `companyIds`:
 * assigned to one of those companies (careplans.companyId), active, not deleted and inside its validity dates.
 * Returns { plan } or { reason } with reason one of: not_found, other_company, inactive, not_started, expired.
 */
const getAllowedCompanyPlan = async (planCode, companyIds) => {
    const code = String(planCode || '').trim();
    if (!code) return { reason: 'not_found' };
    const [plan] = await sequelizeDB1.query(
        `SELECT id, plan_code, packageName, companyId, care_plan_id, isActive, isDeleted, validFrom, validUpto
         FROM carePlans WHERE plan_code = :code LIMIT 1`,
        { replacements: { code }, type: sequelizeDB1.QueryTypes.SELECT }
    );
    if (!plan) return { reason: 'not_found' };
    const allowedCompanies = (companyIds || []).map(Number).filter(Boolean);
    if (!allowedCompanies.includes(Number(plan.companyId))) return { reason: 'other_company' };
    if (Number(plan.isActive) !== 1 || Number(plan.isDeleted) === 1) return { reason: 'inactive' };
    const today = todayInIndia();
    const from = planDate(plan.validFrom);
    const upto = planDate(plan.validUpto);
    // a date that cannot be read is treated as not usable rather than as "no limit"
    if (from === null || upto === null) return { reason: 'inactive' };
    if (from && today < from) return { reason: 'not_started' };
    if (upto && today > upto) return { reason: 'expired' };
    return { plan };
};

module.exports = {
    getCarePlanDetailsByCompanyId,
    getAllowedCompanyPlan,
};
