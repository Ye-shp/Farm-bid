const { NotificationModel, DELIVERY_CHANNELS } = require('../models/Notification');
const User = require('../models/User');
const { client, messagingServiceSid } = require('../config/twilio');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Enhanced SMS sender with error handling
const sendSms = async (phoneNumber, message) => {
  try {
    const response = await client.messages.create({
      body: message,
      to: phoneNumber,
      messagingServiceSid,
    });
    return { success: true, response };
  } catch (error) {
    console.error('SMS delivery failed:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code
    };
  }
};

// Email sender using SendGrid
const sendEmail = async (email, subject, htmlContent) => {
  try {
    const msg = {
      to: email,
      from: process.env.TWILIO_VERIFIED_EMAIL,
      subject: subject,
      html: htmlContent,
    };
    
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    console.error('Email delivery failed:', error);
    return {
      success: false,
      error: error.response?.body?.errors || error.message
    };
  }
};

// Unified notification delivery system
const deliverNotification = async (notification, io) => {
  const user = await User.findById(notification.user)
    .select('phoneNumber email')
    .lean();

  for (const channel of notification.channels) {
    let result;
    try {
      switch (channel) {
        case DELIVERY_CHANNELS.SMS:
          result = user.phoneNumber 
            ? await sendSms(user.phoneNumber, notification.message)
            : { success: false, error: 'User has no phone number' };
          break;

        case DELIVERY_CHANNELS.EMAIL:
          result = user.email
            ? await sendEmail(
                user.email,
                notification.title || 'New Notification',
                `<html>
                  <body>
                    <h2>${notification.title}</h2>
                    <p>${notification.message}</p>
                    ${notification.action?.url ? 
                      `<a href="${notification.action.url}">${notification.action.text || 'Take Action'}</a>` : ''}
                  </body>
                 </html>`
              )
            : { success: false, error: 'User has no email' };
          break;

        case DELIVERY_CHANNELS.IN_APP:
          result = sendInApp(io, notification.user, notification);
          break;

        default:
          result = { 
            success: false, 
            error: `Unsupported channel: ${channel}` 
          };
      }
    } catch (error) {
      result = { success: false, error: error.message };
    }

    await NotificationModel.findByIdAndUpdate(
      notification._id,
      {
        $push: {
          'status.deliveredChannels': {
            channel,
            deliveredAt: new Date(),
            success: result.success,
            errorMessage: result.error
          }
        }
      }
    );
  }

  return notification;
};

// Modified createAndSendNotification to handle rich content
const createAndSendNotification = async (userId, notificationData, io) => {
  const notification = await NotificationModel.create({
    user: userId,
    channels: notificationData.channels || [DELIVERY_CHANNELS.IN_APP],
    ...notificationData,
    status: {
      read: false,
      deliveredChannels: []
    }
  });
  
  return deliverNotification(notification, io);
};