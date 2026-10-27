// Protects routes: only logged-in users get through.
// After this runs, every route can use req.user and req.businessId.
const config = require('../config');
const prisma = require('../lib/prisma');
const { hashToken } = require('../lib/tokens');
const { clearSessionCookie } = require('../lib/session');
const { accountStatus } = require('../lib/account');

async function requireAuth(req, res, next) {
  const token = req.cookies?.[config.session.cookieName];
  if (!token) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { business: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }

  req.authSession = session;
  req.user = session.user;
  req.business = session.user.business;
  req.businessId = session.user.businessId;
  next();
}

// For dashboard features: also needs a paid plan and a verified phone
// (or the development shortcuts in .env). Use after requireAuth.
async function requireActive(req, res, next) {
  const account = await accountStatus(req.user);
  if (account.nextStep !== 'dashboard') {
    return res.status(403).json({
      error: 'Please finish setting up your account first.',
      nextStep: account.nextStep,
    });
  }
  req.account = account;
  next();
}

module.exports = { requireAuth, requireActive };