// services/smsService.js
const axios = require('axios');
const { SMS_API_KEY, SMS_SENDER_ID, SMS_ENTITY_ID, SMS_TEMPLATE_ID, SMS_API_URL } = require('../config/secret');

/**
 * SEC-034: the URL was built by string concatenation. `message` was encoded but
 * `phoneNumber` and `template_id` were not, so a phone value containing `&`
 * injected or overrode downstream query parameters - letting an attacker choose
 * the SMS body and the sender id, sent from the company's own account.
 *
 * URLSearchParams encodes every value, which removes the whole class rather than
 * patching the two known-bad parameters.
 *
 * SEC-016: the response and the axios error object are no longer logged. The
 * error's `config.url` embedded SMS_API_KEY.
 */
const sendSms = (phoneNumber, message, template_id) => {
    const normalised = String(phoneNumber).replace(/[^\d+]/g, '');
    if (!/^\+?\d{8,15}$/.test(normalised)) {
        return Promise.reject(new Error('Invalid phone number'));
    }
    if (!/^\d+$/.test(String(template_id))) {
        return Promise.reject(new Error('Invalid template id'));
    }

    const url = new URL(SMS_API_URL);
    url.searchParams.set('apikey', SMS_API_KEY);
    url.searchParams.set('senderid', SMS_SENDER_ID);
    url.searchParams.set('number', normalised);
    url.searchParams.set('pe_id', SMS_ENTITY_ID);
    url.searchParams.set('template_id', String(template_id));
    url.searchParams.set('message', message);
    url.searchParams.set('format', 'json');

    return axios.get(url.toString(), { timeout: 10000 })
        .then(response => {
            if (response.data && response.data.status === 'OK') {
                return response.data;
            } else {
                throw new Error('Failed to send SMS');
            }
        })
        .catch(error => {
            // Never log `error` itself: its config.url carries the API key.
            console.error('[sms] send failed');
            throw new Error('SMS Error');
        });
};

module.exports = {
    sendSms
};
