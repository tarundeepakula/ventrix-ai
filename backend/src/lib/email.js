
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const config = require('../config');

let transporter = null;
let resend = null;

if (config.resend.apiKey) {
  resend = new Resend(config.resend.apiKey);
}

if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
  });
}

async function sendEmail({ to, subject, text, html }) {
  if (resend) {
    const { error } = await resend.emails.send({
      from: config.resend.from,
      to: [to],
      subject,
      text,
      html,
    });

    if (error) {
      throw new Error(`Resend email failed: ${error.message}`);
    }

    return;
  }

  if (transporter) {
    await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject,
      text,
      html,
    });

    return;
  }

  if (config.isProd) {
    throw new Error('No email provider is configured.');
  }

  console.log('\n---------- EMAIL (development only; not sent) ----------');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(text || html || '');
  console.log('--------------------------------------------------------\n');
}

module.exports = { sendEmail };
