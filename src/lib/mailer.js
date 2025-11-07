const nodemailer = require('nodemailer');

// Read SMTP configuration from environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || false; // true for 465, false for other ports
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || (SMTP_USER || 'no-reply@localhost');

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
  console.warn('Mailer: SMTP configuration not fully provided. Emails will fail until SMTP_* env vars are set.');
}

// Configure transporter with a safe dev-mode TLS relaxation when not in production.
const transportOptions = {
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
};

// If we're in development or SMTP verification problems occur in local environments,
// allow connections even if the certificate chain can't be fully verified. This
// is explicitly only for non-production environments to avoid weakening security in prod.
if ((process.env.NODE_ENV || 'development') !== 'production') {
  transportOptions.tls = { rejectUnauthorized: false };
}

const transporter = nodemailer.createTransport(transportOptions);

async function sendMail({ to, subject, html, text }) {
  if (!to) throw new Error('Missing `to` for sendMail');
  const msg = {
    from: MAIL_FROM,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  };
  return transporter.sendMail(msg);
}

module.exports = { sendMail };
