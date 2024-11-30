const { client, messagingServiceSid } = require('../config/twilio');

const sendSms = async (to, message) => {
    try {
        const response = await client.messages.create({
            body: message,
            to, // The recipient's phone number
            messagingServiceSid, // Messaging Service SID
        });
        return response;
    } catch (error) {
        console.error('Error sending SMS:', error);
        throw error;
    }
};

module.exports = {sendSms};

const sendSmsToBuyer = async (buyerPhoneNumber, contractDetails) => {
    const message = `A farmer is ready to fulfill your open contract for: ${contractDetails}. Log in to Elipae to view more details.`;
    try {
        const response = await client.messages.create({
            body: message,
            to: buyerPhoneNumber, // The recipient's phone number
            messagingServiceSid, // Messaging Service SID
        });
        return response;
    } catch (error) {
        console.error('Error sending SMS to buyer:', error);
        throw error;
    }
};

module.exports = {sendSmsToBuyer};