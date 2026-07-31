import nodemailer from "nodemailer";

import { env } from "../config/env.js";
import logger from "../config/logger.js";

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  if (!env.SMTP_HOST || !env.SMTP_USER) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter;
};

/**
 * Sends an email if SMTP is configured; otherwise logs it to the
 * server console (development-friendly fallback, so OTP login can be
 * tested locally without a real mail provider).
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  const mailer = getTransporter();

  if (!mailer) {
    logger.warn(
      `[email:disabled] SMTP not configured - would have sent "${subject}" to ${to}`
    );
    logger.info(`[email:body] ${text || html}`);
    return { delivered: false, dev: true };
  }

  await mailer.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  return { delivered: true };
};

export const sendOtpEmail = async (email, otp, purpose) => {
  const subject =
    purpose === "REGISTER"
      ? "Verify your email to create your account"
      : "Your login verification code";

  const text = `Your verification code is ${otp}. It expires in ${env.OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`;

  const html = `
    <div style="font-family:sans-serif;font-size:15px;color:#111">
      <p>${
        purpose === "REGISTER"
          ? "Use the code below to verify your email and finish creating your account."
          : "Use the code below to log in."
      }</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p>
      <p>This code expires in ${env.OTP_EXPIRY_MINUTES} minutes.</p>
      <p style="color:#666">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  return sendEmail({ to: email, subject, html, text });
};

export default { sendEmail, sendOtpEmail };
