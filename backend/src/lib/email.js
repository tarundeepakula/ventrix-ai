// Sends emails. While SMTP is not set up in .env, emails are printed in the
// terminal instead, so you can copy the reset link while developing.
const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

async function sendEmail({ to, subject, text, html }) {
  if (!transporter) {
    console.log('\n---------- EMAIL (not sent: SMTP not configured) ----------');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    console.log('------------------------------------------------------------\n');
    return;
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
}

module.exports = { sendEmail };
