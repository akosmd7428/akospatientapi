const LabTestService = require('../services/labTestService');
const AppointmentService = require('../services/appointmentService');
const CarePlanService = require('../services/carePlanService');
const PatientService = require('../services/patientService');
const PatientCareTeamService = require('../services/patientCareTeamService');
const SubscriptionUsage = require('../services/subscriptionUsageService');
const AppointmentController = require('./appointmentController');
const LabOrder = require('../models/labOrder');
const CommonHelper = require('../helpers/commonHelper');
const { messages } = require('../config/language');
const { STATUS_CODE } = require('../config/constant');

/*
 * Company care plan (free services) handlers. They only run for a patient whose company (or its parent company) has
 * worksman_company_list.is_plan_id_verify = 1 (see helpers/planRoute.js); for every other patient the existing
 * controllers run unchanged.
 *
 * Each handler deals only with the plan case: the service is free because the patient's plan
 * (services/subscriptionUsageService.js) still has a use left this period. Anything else - no plan, used up, already
 * paid, company does not charge, ... - is passed to `existing()`, the original controller function, unchanged.
 *
 * planKey per service: labTests = lab test booking, careAppointment = book appointment, practitioner = talk to doctor.
 */

const planInfo = (service, allowance) => ({
    service,
    plan_id: allowance.planId,
    total: allowance.planValue,
    used: allowance.used,
    remaining: allowance.remaining,
});

class PlanServiceController {

    // GET /labs/check-payment-status?service=labTests|careAppointment|practitioner
    // is_paid 0 (+ plan) while the plan has a free use left. careAppointment / practitioner used up: is_paid 1 (the user
    // pays; a booking is refused with 402 until the slot is paid, the app takes the call payment first). No plan row, or
    // labTests used up: the existing answer
    static async checkCallPaymentStatus(req, res, existing) {
        const { company_id, service } = req.query;
        if (!SubscriptionUsage.isService(service)) return existing();
        if (!(await LabTestService.isPatientCompany(req.user.id, company_id))) return existing();
        const allowance = await SubscriptionUsage.getAllowance(req.user, service);
        if (!allowance) return existing();
        if (allowance.remaining > 0) {
            const data = { is_paid: 0, plan: planInfo(service, allowance) };
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, 'Data Fetched Successfully', { data });
        }
        // talk to doctor already paid (payment not used by a call yet): no second payment
        if (service === 'practitioner' && await SubscriptionUsage.unusedCallPayment(req.user.id)) {
            const data = { is_paid: 0, plan: { ...planInfo(service, allowance), paid: true } };
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, 'Data Fetched Successfully', { data });
        }
        // careAppointment (book appointment) and practitioner (talk to doctor) used up: the user pays
        if (service === 'careAppointment' || service === 'practitioner') {
            const data = { is_paid: 1, plan: planInfo(service, allowance) };
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, 'Data Fetched Successfully', { data });
        }
        return existing();
    }

    // GET /labs/orders/:orderId - the cart summary: a new, unpaid order is shown free while the plan has a lab test left
    static async getLabOrdersByPatient(req, res, existing) {
        const { orderId } = req.params;
        const order = await LabOrder.findOne({ where: { id: orderId, patientId: req.user.id, isDeleted: false }, attributes: ['id', 'uniqueBookingId', 'paymentStatus'] });
        if (!order || order.uniqueBookingId != null || order.paymentStatus === 'paid') return existing();
        const allowance = await SubscriptionUsage.getAllowance(req.user, 'labTests');
        if (!allowance || allowance.remaining <= 0) return existing();

        const labOrders = await LabTestService.getLabOrdersByPatientId(orderId);
        const details = (Array.isArray(labOrders) && labOrders[0] && labOrders[0].orderDetails) || [];
        const payable = details.some(item => item.isFree !== 1 && ((parseFloat(item.price) || 0) - (parseFloat(item.discount) || 0)) > 0);
        if (payable) {
            details.forEach(item => { item.isFree = 1; item.planFree = 1; });
            labOrders[0].plan = planInfo('labTests', allowance);
        }
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.ordersFetched, { labOrders });
    }

    // POST /labs/purchaseLabTest and /labs/purchaseLabTestMobile: a new order that would cost something is booked free
    // and uses one lab test of the plan (same booking as the existing free branch, orderStatus as in each endpoint)
    static purchaseLabTestWith(freeOrderStatus) {
        return async (req, res, existing) => {
            const { cartId, orderId } = req.body;
            const order = await LabOrder.findOne({
                where: { id: orderId, patientId: req.user.id, isDeleted: false },
                attributes: ['uniqueBookingId', 'paymentStatus', 'orderStatus'],
            });
            // not found, already started or already paid: the existing code answers exactly as before
            if (!order || order.uniqueBookingId != null || order.paymentStatus == 'paid') return existing();
            const totalPrice = await LabTestService.getPayableTotal(orderId);
            if (!(totalPrice > 0)) return existing(); // already free (or no total): existing free booking

            const planUse = await SubscriptionUsage.useFree(req.user, 'labTests', { referenceType: 'labOrder', referenceId: orderId });
            if (!planUse) return existing(); // no free lab test left: existing paid flow
            try {
                const uniqueBookingId = await LabTestService.generateUniqueBookingId();
                const result = await LabTestService.updateLabOrder(orderId, {
                    totalPrice: 0,
                    uniqueBookingId,
                    isPaid: true,
                    orderStatus: freeOrderStatus,
                    paymentStatus: 'paid',
                });
                if (result[0] === 0) {
                    await SubscriptionUsage.release(planUse);
                    return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.labOrderNotFound);
                }
                await LabTestService.removeCart(cartId, req.user.id);
                return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.bookingConfirmed, { uniqueBookingId, plan: planInfo('labTests', planUse) });
            } catch (error) {
                await SubscriptionUsage.release(planUse);
                console.error('[subscription] free lab booking failed:', error.message);
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
            }
        };
    }

    /*
     * POST /appointment/book - only for a company with is_plan_id_verify = 1 (helpers/planRoute.js), else the existing
     * AppointmentController.bookAppointment runs unchanged.
     *   1. the care plan assigned to the logged in user's company (careplans.companyId, active, valid today) and its
     *      careAppointment row in subscriptionPlans (planValue = free appointments per patient per period)
     *   2. how many careAppointment the logged in user already used this period (subscription_plan_usage)
     *   3. used < planValue -> the appointment is booked free and one use is stored
     *      used up           -> the user has to pay: 402 until the slot is paid, a paid slot books as before
     * No plan / no careAppointment row for the company: the existing booking.
     */
    static async bookAppointment(req, res, existing) {
        const { doctorId, date, time } = req.body;
        const patientId = req.user.id;

        // 1 + 2: the company's plan and what the user already used of its careAppointment
        const allowance = await SubscriptionUsage.getAllowance(req.user, 'careAppointment');
        if (!allowance) return existing();

        // a slot the user already paid for is booked by the existing code (is_paid = 1), the plan is not used
        const is_paid = (await AppointmentService.hasPaidAppointmentPayment(patientId, date, time)) ? 1 : 0;
        if (is_paid) return existing();

        // 3: used up -> pay first
        if (allowance.remaining <= 0) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_402_PAYMENT_REQUIRED, messages.planAppointmentPaymentRequired);
        }

        try {
            // the same checks as the existing booking, before a free use is taken
            const allowedDoctorIds = await PatientCareTeamService.getAllowedDoctorIds(patientId, [doctorId]);
            if (!allowedDoctorIds.includes(Number(doctorId))) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_403_FORBIDDEN, 'Doctor not allowed');
            }
            const appointmentData = { patientId, doctorId, date, time, isConfirmed: false, isActive: true, is_paid };
            const found = await AppointmentService.checkAppointment(patientId, doctorId, date, time, is_paid);
            if (found && found.alreadyExists) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_409_CONFLICT, 'An appointment already exists');
            }
            if (found && found.existsWithOtherDoctor) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_409_CONFLICT, 'An appointment exists with a different doctor.');
            }

            const planUse = await SubscriptionUsage.useFree(req.user, 'careAppointment', { referenceType: 'appointment' });
            // the last free one was just taken by another booking of the same user: pay first
            if (!planUse) return CommonHelper.sendError(res, STATUS_CODE.HTTP_402_PAYMENT_REQUIRED, messages.planAppointmentPaymentRequired);
            let appointment;
            try {
                appointment = await AppointmentService.bookAppointment(appointmentData);
            } catch (bookError) {
                await SubscriptionUsage.release(planUse);
                throw bookError;
            }
            await SubscriptionUsage.setReference(planUse, 'appointment', appointment && appointment.id);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.appointmentBooked, { appointment, plan: planInfo('careAppointment', planUse) });
        } catch (error) {
            // same answers as the existing booking: 409 for a slot that is already booked, else a server error
            if (error.statusCode === STATUS_CODE.HTTP_409_CONFLICT) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_409_CONFLICT, error.message);
            }
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    // GET /care/plan-value: plan values of the logged in user, from the care plan assigned to the user's company
    // (services/subscriptionUsageService.js getPlanSummary). 404 when the company has no active care plan
    static async getPlanValue(req, res) {
        try {
            const data = await SubscriptionUsage.getPlanSummary(req.user);
            if (!data) {
                return CommonHelper.sendError(res, STATUS_CODE.HTTP_404_NOT_FOUND, messages.planNotAssigned);
            }
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { data });
        } catch (error) {
            console.error('[subscription] plan value failed:', error.message);
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError);
        }
    }

    // GET /appointment/my-medicines (company with is_plan_id_verify = 1): the existing response plus planValue, the plan
    // values of the logged in user (same object as /care/plan-value). No plan assigned: the existing response unchanged
    static async myMedicines(req, res, existing) {
        const planValue = await SubscriptionUsage.getPlanSummary(req.user);
        if (!planValue) return existing();
        try {
            const formattedMedicines = await AppointmentController.getFormattedMedicines(req);
            return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.medicinesFetched, { formattedMedicines, planValue });
        } catch (error) {
            return CommonHelper.sendError(res, STATUS_CODE.HTTP_500_INTERNAL_SERVER_ERROR, messages.serverError, error.message);
        }
    }

    // GET /care/plan: the care plan page shows the plan counts (per patient, per period) for the plan in use
    static async getCarePlanDetails(req, res, existing) {
        const patientId = req.user.id;
        const { companyId } = req.query;
        if (!(await PatientService.isPatientConnectedToCompany(patientId, companyId))) return existing();
        const carePlans = await CarePlanService.getCarePlanDetailsByCompanyId(companyId, patientId);
        if (carePlans && carePlans.planDetails) {
            for (const service of Object.keys(SubscriptionUsage.SERVICES)) {
                const keys = [service, 'Package ' + service].filter(key => carePlans.planDetails[key]);
                if (!keys.length) continue;
                const allowance = await SubscriptionUsage.getAllowance(req.user, service);
                if (!allowance || Number(allowance.carePlanId) !== Number(carePlans.carePlanId)) continue;
                for (const key of keys) {
                    Object.assign(carePlans.planDetails[key], {
                        total: allowance.planValue,
                        used: allowance.used,
                        remaining: allowance.remaining,
                        periodStart: allowance.periodStart,
                    });
                }
            }
        }
        return CommonHelper.sendSuccess(res, true, STATUS_CODE.HTTP_200_OK, messages.dataFetched, { carePlans });
    }
}

PlanServiceController.purchaseLabTest = PlanServiceController.purchaseLabTestWith('Payment Completed');
PlanServiceController.purchaseLabTestMobile = PlanServiceController.purchaseLabTestWith('confirmed');

module.exports = PlanServiceController;
