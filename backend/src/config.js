// Reads settings from the .env file in one place,
// so the rest of the code never touches process.env directly.
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env. Copy it from .env.example and fill it in.`);
  }
  return value;
}

const isProd = process.env.NODE_ENV === 'production';

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT) || 4000,
  appUrl: (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, ''),
  databaseUrl: required('DATABASE_URL'),

  // Login cookie
  session: {
    cookieName: 'vx_session',
    days: 30,
  },
  // Password reset links stop working after this many minutes
  passwordReset: {
    minutes: 30,
  },

  // Email. Leave SMTP_HOST empty while developing: emails print in the terminal.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'Ventrix AI <no-reply@ventrix.ai>',
  },
};

module.exports = config;
