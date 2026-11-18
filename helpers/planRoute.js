const SubscriptionUsage = require('../services/subscriptionUsageService');

/*
 * Route switch for the company care plan (free services) add-on.
 *
 *   router.post('/purchaseLabTest', jwtAuth, ..., planRoute(PlanServiceController.purchaseLabTest, LabTestController.purchaseLabTest));
 *
 * is_plan_id_verify = 1 in worksman_company_list for the logged in patient's company (or its parent company)
 *   -> planHandler(req, res, existing) runs; it handles the plan case itself and calls existing() for everything else
 * otherwise (flag 0, not a patient, or the flag cannot be read)
 *   -> the existing handler runs exactly as before
 */
const planRoute = (planHandler, existingHandler) => async (req, res, next) => {
    const existing = () => existingHandler(req, res, next);
    let usePlan = false;
    try {
        usePlan = !!(req.user && req.user.role === 'patient' && await SubscriptionUsage.isPlanVerifyPatient(req.user.id));
    } catch (error) {
        console.error('[subscription] is_plan_id_verify check failed, using the existing flow:', error.message);
        usePlan = false;
    }
    if (!usePlan) return existing();
    try {
        return await planHandler(req, res, existing);
    } catch (error) {
        console.error('[subscription] plan handler failed, using the existing flow:', error.message);
        if (!res.headersSent) return existing();
    }
};

module.exports = planRoute;
