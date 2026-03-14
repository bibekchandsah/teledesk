import nodemailer from 'nodemailer';
import logger from '../utils/logger';

const transporter = nodemailer.createTransport({
  service: 'gmail', // Or use SMTP settings from env
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      logger.warn('Email credentials not configured. Skipping email send.');
      logger.info(`Email intended for ${to}: ${subject}`);
      return;
    }

    const info = await transporter.sendMail({
      from: `"TeleDesk Security" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    logger.info(`Email sent: ${info.messageId}`);
  } catch (error) {
    logger.error(`Error sending email: ${(error as Error).message}`);
    throw new Error('Failed to send verification email');
  }
};

export const sendOtpEmail = async (to: string, otp: string, actionName: string) => {
  const subject = `Your TeleDesk Verification Code: ${otp}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
      <h2 style="color: #333; text-align: center;">TeleDesk Security</h2>
      <p style="font-size: 16px; color: #555;">Hi there,</p>
      <p style="font-size: 16px; color: #555;">You've requested to <strong>${actionName}</strong> on your TeleDesk account.</p>
      <div style="background-color: #fff; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 1px dashed #ccc;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #007bff;">${otp}</span>
      </div>
      <p style="font-size: 14px; color: #777;">This code will expire in 10 minutes. If you didn't request this, please secure your account immediately.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #aaa; text-align: center;">&copy; ${new Date().getFullYear()} TeleDesk. Secure Messaging Everywhere.</p>
    </div>
  `;
  await sendEmail(to, subject, html);
};

export const sendLinkEmail = async (to: string, link: string, actionName: string) => {
  const subject = `Verify your request: ${actionName}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
      <h2 style="color: #333; text-align: center;">TeleDesk Security</h2>
      <p style="font-size: 16px; color: #555;">Hi there,</p>
      <p style="font-size: 16px; color: #555;">Please click the button below to confirm your request to <strong>${actionName}</strong>.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${link}" style="background-color: #007bff; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Confirm Request</a>
      </div>
      <p style="font-size: 14px; color: #777;">This link will expire in 24 hours. If you didn't request this, ignore this email.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #aaa; text-align: center;">&copy; ${new Date().getFullYear()} TeleDesk. Secure Messaging Everywhere.</p>
    </div>
  `;
  await sendEmail(to, subject, html);
};
