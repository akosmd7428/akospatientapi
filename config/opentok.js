const OpenTok = require('opentok');
const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

const opentok = new OpenTok(apiKey, apiSecret);

module.exports = opentok;
