const sgMail = require('@sendgrid/mail');

// Set SendGrid API key from environment variables
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Default sender email (should be verified in SendGrid)
const DEFAULT_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@elipae.com';

// Email templates for different notification types
const EMAIL_TEMPLATES = {
  // Payment related templates
  PAYMENT_SUCCESSFUL: {
    subject: 'Payment Successful - Elipae',
    generateHtml: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h2 style="color: #4CAF50;">Payment Successful</h2>
        <p>Your payment of $${data.amount.toFixed(2)} has been successfully processed.</p>
        <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
        <p><strong>Date:</strong> ${new Date(data.date).toLocaleString()}</p>
        ${data.description ? `<p><strong>Description:</strong> ${data.description}</p>` : ''}
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea;">
          <a href="${data.actionUrl}" style="background-color: #4CAF50; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">View Transaction Details</a>
        </div>
      </div>
    `
  },
  
  PAYMENT_FAILED: {
    subject: 'Payment Failed - Action Required - Elipae',
    generateHtml: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h2 style="color: #F44336;">Payment Failed</h2>
        <p>Your payment of $${data.amount.toFixed(2)} could not be processed.</p>
        <p><strong>Reason:</strong> ${data.reason || 'Payment method declined'}</p>
        <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
        <p><strong>Date:</strong> ${new Date(data.date).toLocaleString()}</p>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea;">
          <a href="${data.actionUrl}" style="background-color: #F44336; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">Update Payment Method</a>
        </div>
      </div>
    `
  },
  
  // Recurring payment notifications
  RECURRING_PAYMENT_REMINDER: {
    subject: 'Upcoming Recurring Payment - Elipae',
    generateHtml: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h2 style="color: #2196F3;">Upcoming Recurring Payment</h2>
        <p>This is a reminder that your recurring payment of $${data.amount.toFixed(2)} for "${data.contractTitle}" will be processed in ${data.daysUntilPayment} days.</p>
        <p><strong>Payment Date:</strong> ${new Date(data.paymentDate).toLocaleDateString()}</p>
        <p><strong>Contract:</strong> ${data.contractTitle}</p>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea;">
          <a href="${data.actionUrl}" style="background-color: #2196F3; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">View Contract Details</a>
        </div>
      </div>
    `
  },
  
  // Contract notifications
  CONTRACT_ACCEPTED: {
    subject: 'Contract Accepted - Elipae',
    generateHtml: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h2 style="color: #4CAF50;">Contract Accepted</h2>
        <p>Your contract for "${data.contractTitle}" has been accepted by ${data.sellerName}.</p>
        <p><strong>Contract ID:</strong> ${data.contractId}</p>
        <p><strong>Amount:</strong> $${data.amount.toFixed(2)}</p>
        <p><strong>Delivery Date:</strong> ${new Date(data.deliveryDate).toLocaleDateString()}</p>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea;">
          <a href="${data.actionUrl}" style="background-color: #4CAF50; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">View Contract</a>
        </div>
      </div>
    `
  },
  
  // Auction notifications
  AUCTION_WON: {
    subject: 'Congratulations! You Won an Auction - Elipae',
    generateHtml: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h2 style="color: #4CAF50;">Auction Won!</h2>
        <p>Congratulations! You've won the auction for "${data.auctionTitle}".</p>
        <p><strong>Winning Bid:</strong> $${data.bidAmount.toFixed(2)}</p>
        <p><strong>Auction ID:</strong> ${data.auctionId}</p>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea;">
          <a href="${data.actionUrl}" style="background-color: #4CAF50; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">Complete Purchase</a>
        </div>
      </div>
    `
  },
  
  AUCTION_OUTBID: {
    subject: 'You\'ve Been Outbid - Elipae',
    generateHtml: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h2 style="color: #FF9800;">You've Been Outbid</h2>
        <p>Someone has placed a higher bid on "${data.auctionTitle}".</p>
        <p><strong>Current Highest Bid:</strong> $${data.currentBid.toFixed(2)}</p>
        <p><strong>Your Previous Bid:</strong> $${data.yourBid.toFixed(2)}</p>
        <p><strong>Auction Ends:</strong> ${new Date(data.endTime).toLocaleString()}</p>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea;">
          <a href="${data.actionUrl}" style="background-color: #FF9800; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">Place New Bid</a>
        </div>
      </div>
    `
  },
  
  // Default template for other notifications
  DEFAULT: {
    subject: 'New Notification from Elipae',
    generateHtml: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h2 style="color: #2196F3;">${data.title}</h2>
        <p>${data.message}</p>
        ${data.actionUrl ? `
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea;">
            <a href="${data.actionUrl}" style="background-color: #2196F3; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">${data.actionText || 'View Details'}</a>
          </div>
        ` : ''}
      </div>
    `
  }
};

// Function to send an email using the appropriate template
const sendTemplatedEmail = async (to, type, data) => {
  try {
    const template = EMAIL_TEMPLATES[type] || EMAIL_TEMPLATES.DEFAULT;
    
    const msg = {
      to,
      from: DEFAULT_FROM_EMAIL,
      subject: template.subject,
      html: template.generateHtml({
        ...data,
        actionUrl: data.actionUrl || `${process.env.FRONTEND_URL || 'https://elipae.com'}`
      }),
    };
    
    const response = await sgMail.send(msg);
    return { success: true, response };
  } catch (error) {
    console.error('SendGrid email delivery failed:', error);
    return {
      success: false,
      error: error.response?.body?.errors || error.message
    };
  }
};

module.exports = {
  sgMail,
  DEFAULT_FROM_EMAIL,
  EMAIL_TEMPLATES,
  sendTemplatedEmail
}; 