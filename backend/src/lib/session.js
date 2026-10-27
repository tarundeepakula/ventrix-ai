// Creates and clears the login cookie.
const config = require('../config');
const prisma = require('./prisma');
const { newToken, hashToken } = require('./tokens');

const DAY_MS = 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true, // page scripts cannot read it
    secure: config.isProd, // HTTPS only when live
    sameSite: 'lax',
    path: '/',
  };
}

async function createSession(user, req, res) {
  const token = newToken();
  const maxAge = config.session.days * DAY_MS;

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      userAgent: (req.get('user-agent') || '').slice(0, 300),
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + maxAge),
    },
  });

  res.cookie(config.session.cookieName, token, { ...cookieOptions(), maxAge });
}

function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, cookieOptions());
}

module.exports = { createSession, clearSessionCookie };
