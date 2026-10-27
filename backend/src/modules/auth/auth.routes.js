// Accounts: signup, login, logout, current user, forgot and reset password.
// All routes live under /api/v1/auth
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');

const config = require('../../config');
const prisma = require('../../lib/prisma');
const { newToken, hashToken } = require('../../lib/tokens');
const { createSession, clearSessionCookie } = require('../../lib/session');
const { sendEmail } = require('../../lib/email');
const { requireAuth } = require('../../middleware/auth');
const { accountStatus } = require('../../lib/account');
const { HttpError } = require('../../middleware/errors');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
// Used when an email is not found, so a wrong email takes as long as a wrong
// password and attackers cannot tell which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// At most 10 tries per 15 minutes from one address on login, signup and reset.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
});

// ---------- Input rules ----------

// Accepts "+91 98765 43210", "9876543210", "09876543210" and returns "+919876543210".
function normalizePhone(value) {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length < 11 || digits.length > 15) return null;
  return '+' + digits;
}

const email = z.string().trim().toLowerCase().email('Enter a valid email address.');
const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(100, 'Password is too long.');

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(100),
  businessName: z.string().trim().min(2, 'Enter your business name.').max(150),
  email,
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((v) => v !== null, 'Enter a valid WhatsApp number, e.g. +91 98765 43210.'),
  password: newPassword,
});

// "login" can be an email address or a mobile number.
const loginSchema = z.object({
  login: z.string().trim().min(1, 'Enter your email or mobile number.').max(150),
  password: z.string().min(1, 'Enter your password.'),
});

const forgotSchema = z.object({ email });

const resetSchema = z.object({
  token: z.string().min(10, 'This reset link is invalid.'),
  password: newPassword,
});

// What the frontend is allowed to see about a user (never the password hash).
function publicProfile(user, business) {
  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    },
    business: {
      id: business.id,
      name: business.name,
      timezone: business.timezone,
    },
  };
}

// Profile + where the account is in the setup steps (payment, verify-phone, dashboard).
async function profileWithAccount(user, business) {
  const account = await accountStatus(user);
  return { ...publicProfile(user, business), account, plan: { active: account.paid } };
}

// ---------- Routes ----------

// POST /api/v1/auth/signup  (signup.html)
router.post('/signup', authLimiter, async (req, res) => {
  const data = signupSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists. Please log in.');
  }
  const phoneTaken = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (phoneTaken) {
    throw new HttpError(409, 'This mobile number is already registered. Please log in.');
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const business = await prisma.business.create({
    data: {
      name: data.businessName,
      users: {
        create: {
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          passwordHash,
          role: 'OWNER',
        },
      },
    },
    include: { users: true },
  });
  const user = business.users[0];

  await createSession(user, req, res);
  res.status(201).json(await profileWithAccount(user, business));
});

// POST /api/v1/auth/login  (login.html)
router.post('/login', authLimiter, async (req, res) => {
  const data = loginSchema.parse(req.body);

  // Email if it has an "@", otherwise treat it as a mobile number.
  let where = null;
  if (data.login.includes('@')) {
    where = { email: data.login.toLowerCase() };
  } else {
    const phone = normalizePhone(data.login);
    if (phone) where = { phone };
  }

  const user = where
    ? await prisma.user.findUnique({ where, include: { business: true } })
    : null;
  const ok = await bcrypt.compare(data.password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    throw new HttpError(401, 'Incorrect email/mobile number or password.');
  }

  await createSession(user, req, res);
  res.json(await profileWithAccount(user, user.business));
});

// POST /api/v1/auth/logout  (logout buttons on every page)
router.post('/logout', async (req, res) => {
  const token = req.cookies?.[config.session.cookieName];
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/v1/auth/me  (every dashboard page checks this first)
router.get('/me', requireAuth, async (req, res) => {
  res.json(await profileWithAccount(req.user, req.business));
});

// POST /api/v1/auth/forgot-password  (login.html, "Forgot password?")
router.post('/forgot-password', authLimiter, async (req, res) => {
  const data = forgotSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });

  if (user) {
    // Only the newest link works.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

    const token = newToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + config.passwordReset.minutes * 60 * 1000),
      },
    });

    const link = `${config.appUrl}/reset-password.html?token=${encodeURIComponent(token)}`;
    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Ventrix AI password',
        text:
          `Hi ${user.fullName},\n\n` +
          `Click the link below to set a new password. It works for ${config.passwordReset.minutes} minutes.\n\n` +
          `${link}\n\n` +
          `If you did not ask for this, you can ignore this email.\n\n— Ventrix AI`,
      });
    } catch (err) {
      console.error('Could not send password reset email:', err.message);
    }
  }

  // Same reply either way, so nobody can check which emails have accounts.
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

// POST /api/v1/auth/reset-password  (reset-password.html)
router.post('/reset-password', authLimiter, async (req, res) => {
  const data = resetSchema.parse(req.body);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(data.token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.');
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Log out every device that was signed in with the old password.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  res.json({ message: 'Your password has been updated. Please log in.' });
});

module.exports = router;