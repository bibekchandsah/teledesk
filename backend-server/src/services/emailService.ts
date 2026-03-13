import nodemailer from 'nodemailer';
import logger from '../utils/logger';

// Standard SMTP configuration
// For development, you can use a test account or Mailtrap.
// For production, use Gmail (App Password), SendGrid, etc.
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send a 6-digit reset code to the user's email
 */
export const sendResetCodeEmail = async (email: string, code: string): Promise<boolean> => {
  try {
    const mailOptions = {
      from: `"TeleDesk Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'TeleDesk Chat Lock Reset Code',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Reset Your Chat Lock PIN</h2>
          <p>You requested to reset your chat lock PIN. Use the 6-digit code below to set a new PIN:</p>
          <div style="font-size: 32px; font-weight: bold; background: #f4f4f4; padding: 10px 20px; display: inline-block; border-radius: 8px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code will expire shortly. If you did not request this, please ignore this email.</p>
          <hr />
          <p style="font-size: 12px; color: #777;">TeleDesk Messaging App</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Reset code email sent: ${email} (MessageId: ${info.messageId})`);
    return true;
  } catch (error) {
    logger.error(`Error sending reset code email: ${(error as Error).message}`);
    // In development, we might want to log the code so the user can continue testing even without email setup
    if (process.env.NODE_ENV === 'development') {
      logger.warn(`DEVELOPMENT MODE: Reset code for ${email} is ${code}`);
    }
    return false;
  }
};
