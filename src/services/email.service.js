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
  port: Number(env.SMTP_PORT),
  secure: env.SMTP_SECURE,
  requireTLS: true,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
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
      `[email:disabled] SMTP not configured - would have sent "${subject}" to ${to}`,
    );
    logger.info(`[email:body] ${text || html}`);
    return { delivered: false, dev: true };
  }

  try {
    logger.info(`Sending email to ${to}...`);

    // Verify SMTP connection
    await mailer.verify();
    logger.info("✅ SMTP connection verified.");

    // Send email
    const info = await mailer.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      html,
      text,
    });

    logger.info("✅ Email sent successfully.", {
      messageId: info.messageId,
      response: info.response,
    });

    return {
      delivered: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

// Human-friendly labels for role enum values, e.g. "MAIN_COMPANY_ADMIN"
// -> "Main Company Admin". Used only for email copy.
const formatRoleLabel = (role) => {
  if (!role) return "user";

  return String(role)
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Sent when the assign-or-create user flow creates a brand new user
 * (Main Company Admin / Company Admin / Staff / any future role
 * assignment). Reuses the same mailing architecture as the existing
 * OTP email above.
 */
export const sendUserWelcomeEmail = async (email, { role, companyName } = {}) => {
  const roleLabel = formatRoleLabel(role);
  const companyLine = companyName ? ` at ${companyName}` : "";

  const subject = "Your account has been created";

  const text = `An account has been created for you as ${roleLabel}${companyLine}. Sign in using this email address (${email}) via Google Sign-In, or use the email login option, to get started.`;

  const html = `
    <div style="font-family:sans-serif;font-size:15px;color:#111">
      <p>Welcome!</p>
      <p>An account has been created for you as <strong>${roleLabel}</strong>${companyLine}.</p>
      <p>You can sign in using this email address (<strong>${email}</strong>) to get started.</p>
      <p style="color:#666">If you weren't expecting this, you can safely ignore this email.</p>
    </div>
  `;

  return sendEmail({ to: email, subject, html, text });
};

/**
 * Sent when the assign-or-create user flow updates an *existing* user's
 * role and/or company assignment, instead of creating a duplicate
 * account. Lets the user know their existing account still works.
 */
export const sendUserRoleUpdateEmail = async (email, { role, companyName } = {}) => {
  const roleLabel = formatRoleLabel(role);
  const companyLine = companyName ? ` at ${companyName}` : "";

  const subject = "Your account access has been updated";

  const text = `Your role has been updated to ${roleLabel}${companyLine}. You can continue to log in with your existing account - no new account was created.`;

  const html = `
    <div style="font-family:sans-serif;font-size:15px;color:#111">
      <p>Your account access has changed.</p>
      <p>Your role is now <strong>${roleLabel}</strong>${companyLine}.</p>
      <p>You can log in with your existing account - no action is required.</p>
    </div>
  `;

  return sendEmail({ to: email, subject, html, text });
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

export default {
  sendEmail,
  sendOtpEmail,
  sendUserWelcomeEmail,
  sendUserRoleUpdateEmail,
};
