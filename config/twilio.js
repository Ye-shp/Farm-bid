const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID; // From Twilio Dashboard
const authToken = process.env.TWILIO_AUTH_TOKEN;   // From Twilio Dashboard
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID; // Optional, for messaging service

const client = twilio(accountSid, authToken);

module.exports = {client,messagingServiceSid,};
