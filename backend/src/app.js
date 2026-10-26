// Builds the Express app: security, the API and your pages.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const prisma = require('./lib/prisma');

const app = express();

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

app.use('/api/v1', api);

// Any other /api address that does not exist
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
  
});

// ---------- Your pages (from the public folder) ----------
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Errors ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

module.exports = app;