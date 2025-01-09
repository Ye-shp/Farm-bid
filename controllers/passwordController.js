const User = require('../models/User');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sgMail = require('@sendgrid/mail');

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Request password reset
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // Token expires in 1 hour
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Create email
    const msg = {
      to: user.email,
      from: process.env.SENDGRID_FROM_EMAIL, // Verified sender email
      subject: 'Elipae - Password Reset Request',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2E7D32; margin: 0;">Password Reset Request</h1>
            </div>
            
            <p style="font-size: 16px; color: #333;">Hello,</p>
            
            <p style="font-size: 16px; color: #333; line-height: 1.5;">
              We received a request to reset your password for your Elipae account. 
              Don't worry, we're here to help you regain access to your account.
            </p>

            <div style="text-align: center; margin: 35px 0;">
              <a href="${resetUrl}" 
                style="background-color: #2E7D32; 
                       color: white; 
                       padding: 15px 30px; 
                       text-decoration: none; 
                       border-radius: 5px; 
                       font-weight: bold;
                       display: inline-block;">
                Reset Your Password
              </a>
            </div>

            <p style="font-size: 16px; color: #333; line-height: 1.5;">
              This link will expire in 1 hour for security reasons. If you didn't request this password reset, 
              please ignore this email or contact our support team if you have concerns.
            </p>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="font-size: 14px; color: #666; margin: 0;">
                Best regards,<br>
                The Elipae Team
              </p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 12px;">
              This is an automated email. Please do not reply to this message.
            </p>
            <p style="color: #666; font-size: 12px;">
              If you have any questions, please contact our support team.
            </p>
          </div>
        </div>
      `
    };

    await sgMail.send(msg);
    res.status(200).json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error sending reset email' });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Send confirmation email
    const msg = {
      to: user.email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: 'Elipae - Password Reset Successful',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2E7D32; margin: 0;">Password Reset Successful</h1>
            </div>
            
            <p style="font-size: 16px; color: #333;">Hello,</p>
            
            <p style="font-size: 16px; color: #333; line-height: 1.5;">
              Your password has been successfully reset. You can now log in to your account with your new password.
            </p>

            <div style="text-align: center; margin: 35px 0;">
              <a href="${process.env.FRONTEND_URL}/login" 
                style="background-color: #2E7D32; 
                       color: white; 
                       padding: 15px 30px; 
                       text-decoration: none; 
                       border-radius: 5px; 
                       font-weight: bold;
                       display: inline-block;">
                Go to Login
              </a>
            </div>

            <p style="font-size: 16px; color: #333; line-height: 1.5;">
              If you did not make this change, please contact our support team immediately.
            </p>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="font-size: 14px; color: #666; margin: 0;">
                Best regards,<br>
                The Elipae Team
              </p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 12px;">
              This is an automated email. Please do not reply to this message.
            </p>
            <p style="color: #666; font-size: 12px;">
              If you have any questions, please contact our support team.
            </p>
          </div>
        </div>
      `
    };

    await sgMail.send(msg);
    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
};
