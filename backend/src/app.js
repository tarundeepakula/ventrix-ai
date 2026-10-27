// Builds the Express app: security, the API and your pages.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./config');
const prisma = require('./lib/prisma');
const authRoutes = require('./modules/auth/auth.routes');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

// When hosted behind a load balancer, trust it to tell us the visitor's IP.
if (config.isProd) app.set('trust proxy', 1);

// Security headers. The Content Security Policy stays off until the
// pages' inline scripts move into .js files (a later step in the plan).
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------- API: every route starts with /api/v1 ----------
const api = express.Router();

api.get('/health', async (req, res) => {
  await prisma.$queryRaw`SELECT 1`; // fails if the database can't be reached
  res.json({ ok: true, database: 'connected', time: new Date().toISOString() });
});

api.use('/auth', authRoutes); // signup, login, logout, me, forgot and reset password

app.use('/api/v1', api);

// Any other /api address that does not exist
app.use('/api', notFound);

// ---------- Your pages (from the public folder) ----------
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Errors: turns any error into a clean JSON message ----------
app.use(errorHandler);

module.exports = app;
