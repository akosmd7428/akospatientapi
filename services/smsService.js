// services/smsService.js
const axios = require('axios');
const { SMS_API_KEY, SMS_SENDER_ID, SMS_ENTITY_ID, SMS_TEMPLATE_ID, SMS_API_URL } = require('../config/secret');

const sendSms = (phoneNumber, message, template_id) => {
    const url = `${SMS_API_URL}?apikey=${SMS_API_KEY}&senderid=${SMS_SENDER_ID}&number=${encodeURIComponent(phoneNumber)}&pe_id=${SMS_ENTITY_ID}&template_id=${encodeURIComponent(template_id)}&message=${encodeURIComponent(message)}&format=json`;

    return axios.get(url)
        .then(response => {
            // the request url carries the api key, never log the full response/error objects
            if (response.data && response.data.status === 'OK') {
                return response.data;
            } else {
                throw new Error('Failed to send SMS');
            }
        })
        .catch(error => {
            console.error('SMS send failed:', error.response?.status || error.message);
            throw new Error(`SMS Error: ${error.message}`);
        });
};

module.exports = {
    sendSms
};
