// Starts the Ventrix AI server.
// It serves your HTML pages from /public and the API from /api/v1.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./config');
const prisma = require('./lib/prisma');
const authRoutes = require('./modules/auth/auth.routes');
const contactRoutes = require('./modules/contacts/contacts.routes');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

// When hosted behind a load balancer, trust it to tell us the visitor's IP.
if (config.isProd) app.set('trust proxy', 1);

// Security headers. The content security policy is off for now because your
// pages use inline scripts and onclick="..." handlers; we tighten it later.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------- API ----------
app.get('/api/v1/health', async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/contacts', contactRoutes);

// Any other /api address that does not exist
app.use('/api', notFound);

// ---------- Your HTML pages ----------
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`Ventrix AI is running at ${config.appUrl}`);
});

// Close the database connection cleanly when you stop the server (Ctrl + C).
async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
