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
      subject: 'Farm Bid - Password Reset Request',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h1 style="color: #2E7D32; text-align: center;">Password Reset Request</h1>
          <p>Hello,</p>
          <p>You have requested to reset your password for your Farm Bid account.</p>
          <p>Please click the button below to reset your password. This link will expire in 1 hour.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #2E7D32; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
          </div>
          <p>If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
          <p>Best regards,<br>The Farm Bid Team</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            This is an automated email, please do not reply.
          </p>
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
      subject: 'Farm Bid - Password Reset Successful',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h1 style="color: #2E7D32; text-align: center;">Password Reset Successful</h1>
          <p>Hello,</p>
          <p>Your password has been successfully reset.</p>
          <p>If you did not make this change, please contact our support team immediately.</p>
          <p>Best regards,<br>The Farm Bid Team</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            This is an automated email, please do not reply.
          </p>
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
