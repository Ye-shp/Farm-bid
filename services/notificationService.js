const { NotificationModel, DELIVERY_CHANNELS, PRIORITY_LEVELS, NOTIFICATION_TYPES } = require('../models/Notification');
const User = require('../models/User');
const { client, messagingServiceSid } = require('../config/twilio');
const { sendTemplatedEmail } = require('../config/sendgrid');

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

// Send in-app notification via socket.io
const sendInApp = (io, userId, notification) => {
  if (io) {
    io.to(`user_${userId}`).emit('notification', notification);
  }
  return { success: true };
};

// Map notification types to SendGrid email template types
const getEmailTemplateType = (notificationType) => {
  const templateMap = {
    [NOTIFICATION_TYPES.PAYMENT_SUCCESSFUL]: 'PAYMENT_SUCCESSFUL',
    [NOTIFICATION_TYPES.PAYMENT_FAILED]: 'PAYMENT_FAILED',
    [NOTIFICATION_TYPES.AUCTION_WON]: 'AUCTION_WON',
    [NOTIFICATION_TYPES.AUCTION_BID_OUTBID]: 'AUCTION_OUTBID',
    [NOTIFICATION_TYPES.RECURRING_PAYMENT_REMINDER]: 'RECURRING_PAYMENT_REMINDER',
    [NOTIFICATION_TYPES.CONTRACT_ACCEPTED]: 'CONTRACT_ACCEPTED'
  };
  
  return templateMap[notificationType] || 'DEFAULT';
};

// Extract relevant data for email templates based on notification type
const getEmailTemplateData = (notification) => {
  const baseData = {
    title: notification.title,
    message: notification.message,
    actionUrl: notification.action?.url,
    actionText: notification.action?.text
  };
  
  // Add additional data based on notification type and metadata
  switch (notification.type) {
    case NOTIFICATION_TYPES.PAYMENT_SUCCESSFUL:
      return {
        ...baseData,
        amount: notification.metadata?.amount || 0,
        transactionId: notification.metadata?.transactionId || notification.reference?.id || '',
        date: notification.metadata?.date || notification.createdAt,
        description: notification.metadata?.description || ''
      };
      
    case NOTIFICATION_TYPES.PAYMENT_FAILED:
      return {
        ...baseData,
        amount: notification.metadata?.amount || 0,
        transactionId: notification.metadata?.transactionId || notification.reference?.id || '',
        date: notification.metadata?.date || notification.createdAt,
        reason: notification.metadata?.reason || 'Payment method declined'
      };
      
    case NOTIFICATION_TYPES.AUCTION_WON:
      return {
        ...baseData,
        auctionTitle: notification.metadata?.auctionTitle || 'Auction Item',
        bidAmount: notification.metadata?.bidAmount || 0,
        auctionId: notification.reference?.id || ''
      };
      
    case NOTIFICATION_TYPES.AUCTION_BID_OUTBID:
      return {
        ...baseData,
        auctionTitle: notification.metadata?.auctionTitle || 'Auction Item',
        currentBid: notification.metadata?.currentBid || 0,
        yourBid: notification.metadata?.yourBid || 0,
        endTime: notification.metadata?.endTime || ''
      };
      
    case NOTIFICATION_TYPES.RECURRING_PAYMENT_REMINDER:
      return {
        ...baseData,
        amount: notification.metadata?.amount || 0,
        contractTitle: notification.metadata?.contractTitle || 'Contract',
        daysUntilPayment: notification.metadata?.daysUntilPayment || 3,
        paymentDate: notification.metadata?.paymentDate || ''
      };
      
    case NOTIFICATION_TYPES.CONTRACT_ACCEPTED:
      return {
        ...baseData,
        contractTitle: notification.metadata?.contractTitle || 'Contract',
        contractId: notification.reference?.id || '',
        amount: notification.metadata?.amount || 0,
        sellerName: notification.metadata?.sellerName || 'Seller',
        deliveryDate: notification.metadata?.deliveryDate || ''
      };
      
    default:
      return baseData;
  }
};

// Unified notification delivery system
const deliverNotification = async (notification, io) => {
  const user = await User.findById(notification.user)
    .select('phoneNumber email notificationPreferences')
    .lean();

  if (!user) {
    console.error(`User not found for notification: ${notification._id}`);
    return notification;
  }

  // Check user preferences for each channel
  const userPrefs = user.notificationPreferences || {};
  
  // Determine if this is a high-priority notification
  const isHighPriority = notification.priority === PRIORITY_LEVELS.HIGH || 
                         notification.priority === PRIORITY_LEVELS.URGENT;
  
  // Always send in-app notifications
  const channels = [DELIVERY_CHANNELS.IN_APP];
  
  // For high-priority notifications, add email regardless of user preferences
  if (isHighPriority && user.email) {
    channels.push(DELIVERY_CHANNELS.EMAIL);
  } 
  // For other notifications, respect user preferences
  else if (userPrefs.emailEnabled && user.email) {
    channels.push(DELIVERY_CHANNELS.EMAIL);
  }
  
  // For urgent notifications, add SMS regardless of user preferences
  if (notification.priority === PRIORITY_LEVELS.URGENT && user.phoneNumber) {
    channels.push(DELIVERY_CHANNELS.SMS);
  }
  // For other notifications, respect user preferences
  else if (userPrefs.smsEnabled && user.phoneNumber) {
    channels.push(DELIVERY_CHANNELS.SMS);
  }

  for (const channel of channels) {
    let result;
    try {
      switch (channel) {
        case DELIVERY_CHANNELS.SMS:
          result = await sendSms(user.phoneNumber, notification.message);
          break;

        case DELIVERY_CHANNELS.EMAIL:
          // Use the templated email sender with appropriate template
          const templateType = getEmailTemplateType(notification.type);
          const templateData = getEmailTemplateData(notification);
          
          result = await sendTemplatedEmail(
            user.email,
            templateType,
            templateData
          );
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

// Create and send notification
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

// Send notification to a user
const sendNotification = async (options) => {
  try {
    const { recipient, type, title, message, data = {}, priority = PRIORITY_LEVELS.MEDIUM } = options;
    
    // Create notification in database
    const notification = await NotificationModel.create({
      user: recipient,
      type: type,
      title: title,
      message: message,
      priority: priority,
      category: type.split('_')[0],
      metadata: data,
      reference: data.contractId ? {
        model: 'OpenContract',
        id: data.contractId
      } : undefined,
      action: data.actionUrl ? {
        type: 'link',
        text: data.actionText || 'View Details',
        url: data.actionUrl
      } : undefined,
      status: {
        read: false,
        deliveredChannels: []
      }
    });
    
    // Deliver the notification through appropriate channels
    return deliverNotification(notification);
  } catch (error) {
    console.error('Error sending notification:', error);
    return null;
  }
};

// Mark notification as read
const markAsRead = async (notificationId, userId) => {
  const notification = await NotificationModel.findById(notificationId);
  
  if (!notification) {
    throw new Error('Notification not found');
  }
  
  if (notification.user.toString() !== userId.toString()) {
    throw new Error('Unauthorized');
  }
  
  notification.status.read = true;
  notification.status.readAt = new Date();
  await notification.save();
  
  return notification;
};

module.exports = {
  createAndSendNotification,
  sendNotification,
  markAsRead,
  deliverNotification
};