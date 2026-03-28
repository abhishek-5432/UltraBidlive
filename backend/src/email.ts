import nodemailer from 'nodemailer';

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL || SMTP_USER || 'alerts@ultrabid.local';
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

export function isEmailAlertsConfigured() {
  return !!getTransporter();
}

export async function sendAlertEmail({ to, subject, text, html }: EmailPayload) {
  const activeTransporter = getTransporter();
  if (!activeTransporter || !to) return false;

  try {
    await activeTransporter.sendMail({
      from: `UltraBid Live <${ALERT_FROM_EMAIL}>`,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error('Email alert failed:', error);
    return false;
  }
}
