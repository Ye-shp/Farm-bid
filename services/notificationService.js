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
  console.log(`Attempting to send in-app notification to user ${userId}`);
  if (io) {
    console.log(`Socket.io instance found, sending to room: user_${userId}`);
    // Emit both event types to ensure compatibility with all frontend components
    io.to(`user_${userId}`).emit('notification', notification);
    io.to(`user_${userId}`).emit('notificationUpdate', notification);
    return { success: true };
  } else {
    console.log('No Socket.io instance available');
    return { success: false, error: 'No Socket.io instance available' };
  }
};

// Map notification types to SendGrid email template types
const getEmailTemplateType = (notificationType) => {
  const templateMap = {
    [NOTIFICATION_TYPES.PAYMENT_SUCCESSFUL]: 'PAYMENT_SUCCESSFUL',
    [NOTIFICATION_TYPES.PAYMENT_FAILED]: 'PAYMENT_FAILED',
    [NOTIFICATION_TYPES.AUCTION_WON]: 'AUCTION_WON',
    [NOTIFICATION_TYPES.AUCTION_BID_OUTBID]: 'AUCTION_OUTBID',
    [NOTIFICATION_TYPES.RECURRING_PAYMENT_REMINDER]: 'RECURRING_PAYMENT_REMINDER',
    [NOTIFICATION_TYPES.CONTRACT_ACCEPTED]: 'CONTRACT_ACCEPTED',
    [NOTIFICATION_TYPES.CONTRACT_FULFILLMENT_OFFER]: 'CONTRACT_FULFILLMENT_OFFER'
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
      
    case NOTIFICATION_TYPES.CONTRACT_FULFILLMENT_OFFER:
      return {
        ...baseData,
        contractTitle: notification.metadata?.contractTitle || 'Contract',
        contractId: notification.reference?.id || '',
        farmerName: notification.metadata?.farmerName || 'Farmer',
        price: notification.metadata?.price || 0,
        productType: notification.metadata?.productType || 'Product',
        fulfillmentId: notification.metadata?.fulfillmentId || ''
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
  console.log(`Delivering notification ${notification._id} to user ${notification.user}`);
  
  const user = await User.findById(notification.user)
    .select('phone email notificationPreferences')
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
  console.log(`Adding in-app channel for notification ${notification._id}`);
  
  // For high-priority notifications, add email regardless of user preferences
  if (isHighPriority && user.email) {
    console.log(`Adding email channel for high-priority notification ${notification._id}`);
    channels.push(DELIVERY_CHANNELS.EMAIL);
  } 
  // For other notifications, respect user preferences
  else if (userPrefs.emailEnabled && user.email) {
    console.log(`Adding email channel based on user preferences for notification ${notification._id}`);
    channels.push(DELIVERY_CHANNELS.EMAIL);
  }
  
  // For urgent notifications, add SMS regardless of user preferences
  if (notification.priority === PRIORITY_LEVELS.URGENT && user.phone) {
    console.log(`Adding SMS channel for urgent notification ${notification._id}`);
    channels.push(DELIVERY_CHANNELS.SMS);
  }
  // For other notifications, respect user preferences
  else if (userPrefs.smsEnabled && user.phone) {
    console.log(`Adding SMS channel based on user preferences for notification ${notification._id}`);
    channels.push(DELIVERY_CHANNELS.SMS);
  }

  console.log(`Delivering notification ${notification._id} through channels: ${channels.join(', ')}`);

  for (const channel of channels) {
    let result;
    try {
      console.log(`Attempting to deliver notification ${notification._id} via ${channel}`);
      switch (channel) {
        case DELIVERY_CHANNELS.SMS:
          result = await sendSms(user.phone, notification.message);
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
  console.log(`Creating notification for user ${userId} of type ${notificationData.type}`);
  
  try {
    const notification = await NotificationModel.create({
      user: userId,
      channels: notificationData.channels || [DELIVERY_CHANNELS.IN_APP],
      ...notificationData,
      status: {
        read: false,
        deliveredChannels: []
      }
    });
    
    console.log(`Notification created with ID ${notification._id}, now delivering...`);
    
    // Check if io is available
    if (!io) {
      console.log('No io instance provided, using global.io if available');
      io = global.io;
    }
    
    return deliverNotification(notification, io);
  } catch (error) {
    console.error('Error in createAndSendNotification:', error);
    return null;
  }
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