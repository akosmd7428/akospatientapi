const axios = require('axios');
const { QueryTypes } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');
const { ACROSS_ASSIST_BASE_URL, ACROSS_ASSIST_API_KEY } = require('../config/secret');
const WebhookLog = require('../models/webhookLog');

const text = (value) => (value === undefined || value === null ? '' : String(value));
const amount = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
// labOrders.response is the payment gateway response, stored as json (or a json string)
const parseJson = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (e) { return {}; }
};

const fullName = (row) => `${text(row && row.first_name)} ${text(row && row.last_name)}`.trim();
const textList = (value) => text(value).split(',').map(item => item.trim()).filter(Boolean);

// where the webhook is sent from, each source builds its own payload (see PAYLOAD_BUILDERS)
const WEBHOOK_SOURCES = Object.freeze({
    LAB_TEST: 'lab_test',
    DOCTOR_APPOINTMENT: 'doctor_appointment',
    TALK_TO_DOCTOR: 'talk_to_doctor',
});

const DEFAULT_BASE_URL = 'https://health.acrossassist.in';
const APPOINTMENT_CONFIRMATION_PATH = '/api/Health/GetAppointmentConfirmation';
const REQUEST_TIMEOUT_MS = 15000;

class AcrossAssistService {
    // send the appointment confirmation to Across Assist, the body is forwarded as received (already validated),
    // the base url and an optional api key come from .env (ACROSS_ASSIST_BASE_URL, ACROSS_ASSIST_API_KEY)
    // every call (request + response) is stored in webhook_logs, context = { source, referenceId, patientId, companyId }
    static async sendAppointmentConfirmation(payload, context = {}) {
        const baseUrl = String(ACROSS_ASSIST_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
        const requestUrl = `${baseUrl}${APPOINTMENT_CONFIRMATION_PATH}`;
        const headers = { 'Content-Type': 'application/json' };
        if (ACROSS_ASSIST_API_KEY) {
            headers.Authorization = `Bearer ${ACROSS_ASSIST_API_KEY}`;
        }

        const startedAt = Date.now();
        let result;
        try {
            const response = await axios.post(requestUrl, payload, {
                headers,
                timeout: REQUEST_TIMEOUT_MS,
            });
            result = { ok: true, status: response.status, data: response.data };
        } catch (error) {
            // the partner answered with an error status: its status and body are passed back to the caller
            if (error.response) {
                result = { ok: false, status: error.response.status, data: error.response.data };
            } else {
                // no answer (timeout, dns, connection refused)
                console.error('Across Assist appointment confirmation failed:', error.code || error.message);
                result = { ok: false, status: null, data: null, error: error.code || error.message };
            }
        }

        await AcrossAssistService.saveWebhookLog(requestUrl, payload, result, Date.now() - startedAt, context);
        return result;
    }

    // store the request and the response in webhook_logs (the api key / headers are never stored),
    // a failure to store is logged and does not change the webhook result
    static async saveWebhookLog(requestUrl, payload, result, durationMs, context = {}) {
        try {
            const body = result.data === undefined || result.data === null
                ? null
                : (typeof result.data === 'string' ? result.data : JSON.stringify(result.data));
            const toId = (value) => (Number(value) > 0 ? Number(value) : null);
            await WebhookLog.create({
                partner: 'across_assist',
                source: context.source || 'manual',
                reference_id: context.referenceId !== undefined && context.referenceId !== null
                    ? String(context.referenceId)
                    : (payload && payload.appointment_id ? String(payload.appointment_id) : null),
                patient_id: toId(context.patientId),
                company_id: toId(context.companyId),
                event: context.event ? String(context.event).slice(0, 100) : null,
                // sent / failed, or skipped (set by saveSkippedWebhookLog)
                status: context.status || (result.ok ? 'sent' : 'failed'),
                skip_reason: context.skipReason || null,
                request_url: requestUrl || null,
                request_payload: payload || null,
                response_status: result.status || null,
                response_body: body,
                is_success: Boolean(result.ok),
                error_message: result.error ? String(result.error).slice(0, 1000) : null,
                duration_ms: durationMs,
            });
        } catch (error) {
            console.error('Across Assist webhook log could not be saved:', error.message);
        }
    }

    // a webhook that was not sent (company has is_call_webhook = 0, record not found, unknown source) is also stored,
    // without a request payload (nothing was sent, and no patient data is kept for companies without the webhook)
    static async saveSkippedWebhookLog(skipReason, context = {}) {
        await AcrossAssistService.saveWebhookLog(null, null, { ok: false, status: null, data: null }, null, {
            ...context,
            status: 'skipped',
            skipReason,
        });
    }

    // an error before the request was sent (building the payload, reading the company flag)
    static async saveErrorWebhookLog(errorMessage, context = {}, payload = null) {
        await AcrossAssistService.saveWebhookLog(null, payload, { ok: false, status: null, data: null, error: errorMessage }, null, {
            ...context,
            status: 'failed',
        });
    }

    // true when the company has worksman_company_list.is_call_webhook = 1
    // (SELECT * so a database without the column still works, the webhook is then off)
    static async isWebhookEnabledForCompany(companyId) {
        if (!(Number(companyId) > 0)) return false;
        const [company] = await sequelizeDB1.query(
            'SELECT * FROM worksman_company_list WHERE id = :companyId LIMIT 1',
            { replacements: { companyId: Number(companyId) }, type: QueryTypes.SELECT }
        );
        return Boolean(company) && Number(company.is_call_webhook) === 1;
    }

    // GetAppointmentConfirmation body for a lab order, built from the order, patient, lab and order items
    static async buildLabOrderPayload(orderId) {
        const [order] = await sequelizeDB1.query(`
            SELECT
                lo.*,
                p.first_name, p.last_name, p.phone, p.member_id, p.companyId AS patientCompanyId, p.employer_id AS patientEmployerId,
                l.labName, lb.branchName, lb.branchAddress
            FROM labOrders lo
            INNER JOIN patient p ON p.id = lo.patientId
            LEFT JOIN labs l ON l.id = lo.labId
            LEFT JOIN labBranches lb ON lb.id = lo.labBranchId
            WHERE lo.id = :orderId
            LIMIT 1`, { replacements: { orderId }, type: QueryTypes.SELECT });
        if (!order) return null;

        const items = await sequelizeDB1.query(
            'SELECT name, type, referenceId, price, total, code FROM labOrderDetails WHERE labOrderId = :orderId AND (isDeleted = 0 OR isDeleted IS NULL)',
            { replacements: { orderId }, type: QueryTypes.SELECT }
        );
        const payment = parseJson(order.response);
        const bookingId = text(order.uniqueBookingId || order.id);
        const totalPrice = amount(order.totalPrice);
        // price is before the discount, totalPrice is what the patient pays
        const sellingPrice = totalPrice;

        const payload = {
            booking_id: bookingId,
            appointment_id: text(order.id),
            customer_id: text(order.member_id),
            customer_name: `${text(order.first_name)} ${text(order.last_name)}`.trim(),
            mobile_number: text(order.phone),
            // the sso client's own id of the member, sent on /sso-client-login
            api_customer_id: text(order.member_id),
            appointment_date_time: [text(order.bookingDate), text(order.bookingTime)].filter(Boolean).join(' '),
            event_timestamp: Date.now(),
            booking_source: 'AkosMD',
            service_type: 'client_lab_test',
            status: text(order.orderStatus),
            status_text: text(order.orderStatus),
            provider_id: amount(order.labId),
            provider_name: text(order.labName || order.labType),
            provider_branch: text(order.branchName),
            provider_address: text(order.branchAddress),
            type: text(order.labType),
            vendorType: text(order.labType),
            payment: {
                status: text(order.paymentStatus),
                total_collected_amount: order.isPaid ? text(totalPrice) : '0',
                razorpay_amount: order.isPaid ? text(totalPrice) : '0',
                razorpay_payment_id: text(payment.razorpay_payment_id),
                razorpay_order_id: text(payment.razorpay_order_id),
            },
            order_id: bookingId,
            ordered_for_name: `${text(order.first_name)} ${text(order.last_name)}`.trim(),
            order_type: 'client_lab_test',
            vendor_name: text(order.labName || order.labType),
            status_description: text(order.orderStatus),
            order_items: items.map(item => ({
                name: text(item.name),
                quantity: 1,
                mrp: amount(item.price),
                offered_price: amount(item.total || item.price),
                product_id: text(item.code || item.referenceId),
            })),
            total_amount: totalPrice,
            total_selling_price: sellingPrice,
            total_discount: Math.max(0, amount(order.discountApplied)),
            address: text(order.bookingAddress),
            city: text(order.labCityName),
        };
        return { payload, patientId: order.patientId, companyId: order.patientCompanyId || order.patientEmployerId };
    }

    // patient fields shared by every source (customer, company, address)
    static async getPatientForWebhook(patientId) {
        const [patient] = await sequelizeDB1.query(
            'SELECT * FROM patient WHERE id = :patientId LIMIT 1',
            { replacements: { patientId }, type: QueryTypes.SELECT }
        );
        return patient || null;
    }

    static basePatientPayload(patient) {
        return {
            customer_id: text(patient.member_id),
            customer_name: fullName(patient),
            mobile_number: text(patient.phone),
            // the sso client's own id of the member, sent on /sso-client-login
            api_customer_id: text(patient.member_id),
            event_timestamp: Date.now(),
            booking_source: 'AkosMD',
            ordered_for_name: fullName(patient),
            address: text(patient.address),
            city: text(patient.city),
            pincode: text(patient.pincode || patient.zipcode),
            state: text(patient.state),
        };
    }

    // doctor fields (SELECT * so a missing column only leaves the field empty)
    static async getDoctorPayload(doctorId) {
        if (!(Number(doctorId) > 0)) return {};
        const [doctor] = await sequelizeDB1.query(
            'SELECT * FROM doctor WHERE id = :doctorId LIMIT 1',
            { replacements: { doctorId: Number(doctorId) }, type: QueryTypes.SELECT }
        );
        if (!doctor) return {};
        return {
            doctor_id: text(doctor.id),
            doctor_name: text(doctor.name),
            doctor_specialities: textList(doctor.speciality),
            doctor_gender: text(doctor.gender),
            doctor_qualification: text(doctor.degree),
            doctor_languages: textList(doctor.languages || doctor.language),
            doctor_experience: amount(doctor.experience),
            provider_id: amount(doctor.id),
            provider_name: text(doctor.name),
            provider_address: text(doctor.address),
        };
    }

    // GetAppointmentConfirmation body for a doctor appointment (appointments table)
    static async buildDoctorAppointmentPayload(appointmentId) {
        const [appointment] = await sequelizeDB1.query(
            'SELECT * FROM appointments WHERE id = :appointmentId LIMIT 1',
            { replacements: { appointmentId }, type: QueryTypes.SELECT }
        );
        if (!appointment) return null;
        const patient = await AcrossAssistService.getPatientForWebhook(appointment.patientId);
        if (!patient) return null;
        const doctor = await AcrossAssistService.getDoctorPayload(appointment.doctorId);
        const status = Number(appointment.isConfirmed) === 1 ? 'confirmed' : 'requested';

        const payload = {
            ...AcrossAssistService.basePatientPayload(patient),
            ...doctor,
            booking_id: text(appointment.id),
            appointment_id: text(appointment.id),
            appointment_date_time: [text(appointment.date), text(appointment.time)].filter(Boolean).join(' '),
            service_type: 'client_book_appointment',
            order_type: 'client_book_appointment',
            type: 'doctor_appointment',
            status,
            status_text: status,
            status_description: Number(appointment.isConfirmed) === 1 ? 'Doctor appointment confirmed' : 'Doctor appointment requested, awaiting confirmation',
            payment: { status: Number(appointment.is_paid) === 1 ? 'paid' : 'unpaid' },
            order_id: text(appointment.id),
        };
        return { payload, patientId: patient.id, companyId: patient.companyId || patient.employer_id };
    }

    // GetAppointmentConfirmation body for a talk to doctor call payment (payment_for_call, call_type 1)
    static async buildTalkToDoctorPayload(callPaymentId) {
        const [call] = await sequelizeDB1.query(
            'SELECT * FROM payment_for_call WHERE id = :callPaymentId LIMIT 1',
            { replacements: { callPaymentId }, type: QueryTypes.SELECT }
        );
        if (!call) return null;
        const patient = await AcrossAssistService.getPatientForWebhook(call.patient_id);
        if (!patient) return null;
        const isPaid = String(call.payment_status).toLowerCase() === 'paid';
        const callAmount = amount(call.amounts);

        const payload = {
            ...AcrossAssistService.basePatientPayload(patient),
            booking_id: text(call.id),
            appointment_id: text(call.id),
            appointment_date_time: [text(call.call_date), text(call.call_time)].filter(Boolean).join(' '),
            service_type: 'client_talk_to_doctor',
            order_type: 'client_talk_to_doctor',
            type: 'talk_to_doctor',
            status: text(call.order_status),
            status_text: text(call.order_status),
            status_description: isPaid ? 'Talk to doctor call booked' : text(call.order_status),
            payment: {
                status: text(call.payment_status),
                total_collected_amount: isPaid ? text(callAmount) : '0',
                razorpay_amount: isPaid ? text(callAmount) : '0',
                razorpay_order_id: text(call.razorpay_order_id),
            },
            order_id: text(call.id),
            total_amount: callAmount,
            total_selling_price: callAmount,
            total_discount: 0,
        };
        return { payload, patientId: patient.id, companyId: call.company_id || patient.companyId || patient.employer_id };
    }

    // common webhook: builds the payload of the source, checks is_call_webhook = 1 for the patient's company
    // and sends it to Across Assist. Call it from any place:
    //   AcrossAssistService.sendWebhook(AcrossAssistService.SOURCES.LAB_TEST, labOrderId, 'Payment Completed')
    //   AcrossAssistService.sendWebhook(AcrossAssistService.SOURCES.DOCTOR_APPOINTMENT, appointmentId, 'booked')
    //   AcrossAssistService.sendWebhook(AcrossAssistService.SOURCES.TALK_TO_DOCTOR, callPaymentId, 'payment_paid')
    // every call is stored in webhook_logs with its status: sent / failed / skipped (and the event of the place)
    // never throws: a webhook failure is logged and must not break the booking, so it can be called without await
    static async sendWebhook(source, referenceId, event = null) {
        const context = { source, referenceId, event };
        const builder = PAYLOAD_BUILDERS[source];
        if (!builder) {
            console.error(`Across Assist webhook: unknown source "${source}"`);
            await AcrossAssistService.saveSkippedWebhookLog('unknown_source', context);
            return { sent: false, error: 'unknown_source' };
        }
        let built = null;
        try {
            built = await builder(referenceId);
            if (!built) {
                await AcrossAssistService.saveSkippedWebhookLog('record_not_found', context);
                return { sent: false, skipReason: 'record_not_found' };
            }
            context.patientId = built.patientId;
            context.companyId = built.companyId;
            if (!await AcrossAssistService.isWebhookEnabledForCompany(built.companyId)) {
                await AcrossAssistService.saveSkippedWebhookLog('webhook_disabled', context);
                return { sent: false, skipReason: 'webhook_disabled' };
            }
            // request + response are stored by sendAppointmentConfirmation (status sent / failed)
            const result = await AcrossAssistService.sendAppointmentConfirmation(built.payload, context);
            if (!result.ok) {
                console.error(`Across Assist webhook failed (${source} ${referenceId}):`, result.status, result.error || JSON.stringify(result.data));
            }
            return { sent: true, result };
        } catch (error) {
            console.error(`Across Assist webhook error (${source} ${referenceId}):`, error.message);
            await AcrossAssistService.saveErrorWebhookLog(error.message, context, built && built.payload);
            return { sent: false, error: error.message };
        }
    }

    // send the lab order to Across Assist when the patient's company has is_call_webhook = 1,
    // never throws: a webhook failure is logged and must not break the booking
    static async sendLabOrderWebhook(orderId) {
        // try {
        //     const built = await AcrossAssistService.buildLabOrderPayload(orderId);
        //     if (!built || !await AcrossAssistService.isWebhookEnabledForCompany(built.companyId)) {
        //         return { sent: false };
        //     }
        //     const result = await AcrossAssistService.sendAppointmentConfirmation(built.payload);
        //     if (!result.ok) {
        //         console.error(`Across Assist webhook failed for lab order ${orderId}:`, result.status, result.error || JSON.stringify(result.data));
        //     }
        //     return { sent: true, result };
        // } catch (error) {
        //     console.error(`Across Assist webhook error for lab order ${orderId}:`, error.message);
        //     return { sent: false, error: error.message };
        // }
        return AcrossAssistService.sendWebhook(WEBHOOK_SOURCES.LAB_TEST, orderId, 'lab_order');
    }
}

// payload builder of each source
const PAYLOAD_BUILDERS = {
    [WEBHOOK_SOURCES.LAB_TEST]: (id) => AcrossAssistService.buildLabOrderPayload(id),
    [WEBHOOK_SOURCES.DOCTOR_APPOINTMENT]: (id) => AcrossAssistService.buildDoctorAppointmentPayload(id),
    [WEBHOOK_SOURCES.TALK_TO_DOCTOR]: (id) => AcrossAssistService.buildTalkToDoctorPayload(id),
};

AcrossAssistService.SOURCES = WEBHOOK_SOURCES;

module.exports = AcrossAssistService;
