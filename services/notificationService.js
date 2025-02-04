const { NotificationModel, DELIVERY_CHANNELS } = require('../models/Notification');
const User = require('../models/User');
const { client, messagingServiceSid } = require('../config/twilio');

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
        return { success: false, error: error.message };
    }
};

const sendInApp = (io, userId, notification) => {
    if (!io) return { success: false, error: 'Socket.IO unavailable' };
    
    try {
        const room = `user_${userId}`;
        io.to(room).emit('newNotification', notification.toObject());
        return { success: true };
    } catch (error) {
        console.error('In-app delivery failed:', error);
        return { success: false, error: error.message };
    }
};

const createNotification = async (userId, notificationData) => {
    return NotificationModel.create({
        user: userId,
        channels: notificationData.channels || [DELIVERY_CHANNELS.IN_APP],
        ...notificationData
    });
};

const deliverNotification = async (notification, io) => {
    const user = await User.findById(notification.user).select('phoneNumber');
    
    for (const channel of notification.channels) {
        let result;
        switch (channel) {
            case DELIVERY_CHANNELS.SMS:
                result = user.phoneNumber 
                    ? await sendSms(user.phoneNumber, notification.message)
                    : { success: false, error: 'User has no phone number' };
                break;
            case DELIVERY_CHANNELS.IN_APP:
                result = sendInApp(io, notification.user, notification);
                break;
            default:
                result = { success: false, error: `Unsupported channel: ${channel}` };
        }
        
        await notification.markAsDelivered(
            channel,
            result.success,
            result.error
        );
    }
    
    return notification;
};

const createAndSendNotification = async (userId, notificationData, io) => {
    const notification = await createNotification(userId, notificationData);
    return deliverNotification(notification, io);
};

const getNotificationsForUser = async (userId) => {
    return NotificationModel.find({ user: userId })
        .sort({ createdAt: -1 })
        .lean();
};

const markAsRead = async (notificationId, userId) => {
    const notification = await NotificationModel.findById(notificationId);
    if (!notification) throw new Error('Notification not found');
    if (notification.user.toString() !== userId) throw new Error('Unauthorized');
    return notification.markAsRead();
};

module.exports = {
    createAndSendNotification,
    getNotificationsForUser,
    markAsRead,
};