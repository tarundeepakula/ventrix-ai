// Reads settings from the .env file in one place,
// so the rest of the code never touches process.env directly.
require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 4000,
  appUrl: (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, ''),
};

module.exports = config;