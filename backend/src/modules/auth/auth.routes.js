
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_WAIT_SECONDS = 60;

const BCRYPT_ROUNDS = 12;

function generateEmailOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashEmailOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

async function sendVerificationOtp(user) {
  const otp = generateEmailOtp();
  const now = new Date();

  await prisma.emailVerification.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      email: user.email,
      codeHash: hashEmailOtp(otp),
      expiresAt: new Date(
        now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000
      ),
      attempts: 0,
    },
    update: {
      email: user.email,
      codeHash: hashEmailOtp(otp),
      expiresAt: new Date(
        now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000
      ),
      attempts: 0,
      updatedAt: now,
    },
  });

  try {
    await sendEmail({
      to: user.email,
      subject: 'Verify your Ventrix AI email',
      text:
        `Hi ${user.fullName},\n\n` +
        `Your Ventrix AI verification code is: ${otp}\n\n` +
        `This code expires in ${OTP_EXPIRY_MINUTES} minutes. ` +
        'Do not share it with anyone.\n\n' +
        '— Ventrix AI',
    });
  } catch (err) {
    await prisma.emailVerification.deleteMany({
      where: {
        userId: user.id,
        codeHash: hashEmailOtp(otp),
      },
    });

    console.error('Could not send verification OTP:', err.message);

    throw new HttpError(
      503,
      'We could not send your verification email. Please try again.'
    );
  }
}

// Dummy password hash prevents an obvious timing difference when
// the submitted email/mobile number does not exist.
const DUMMY_HASH = bcrypt.hashSync(
  'not-a-real-password',
  BCRYPT_ROUNDS
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many attempts. Please wait 15 minutes and try again.',
  },
});

// ---------- Input validation ----------

function normalizePhone(value) {
  let digits = value.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    digits = '91' + digits;
  }

  if (digits.length < 11 || digits.length > 15) {
    return null;
  }

  return '+' + digits;
}

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.');

const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(100, 'Password is too long.');

const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name.')
    .max(100),

  businessName: z
    .string()
    .trim()
    .min(2, 'Enter your business name.')
    .max(150),

  email,

  phone: z
    .string()
    .transform(normalizePhone)
    .refine(
      (value) => value !== null,
      'Enter a valid WhatsApp number, e.g. +91 98765 43210.'
    ),

  password: newPassword,
});

const loginSchema = z.object({
  login: z
    .string()
    .trim()
    .min(1, 'Enter your email or mobile number.')
    .max(150),

  password: z.string().min(1, 'Enter your password.'),
});

const forgotSchema = z.object({
  email,
});

const resetSchema = z.object({
  token: z.string().min(10, 'This reset link is invalid.'),
  password: newPassword,
});

const resendEmailOtpSchema = z.object({}).strict();

const verifyEmailOtpSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the six-digit verification code.'),
});

// ---------- Public user profile ----------

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

async function profileWithAccount(user, business) {
  const account = await accountStatus(user);

  return {
    ...publicProfile(user, business),
    account,
    plan: {
      active: account.paid,
    },
  };
}

// ---------- Signup ----------

// POST /api/v1/auth/signup
router.post('/signup', authLimiter, async (req, res) => {
  const data = signupSchema.parse(req.body);

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existing) {
    throw new HttpError(
      409,
      'An account with this email already exists. Please log in.'
    );
  }

  const phoneTaken = await prisma.user.findUnique({
    where: { phone: data.phone },
  });

  if (phoneTaken) {
    throw new HttpError(
      409,
      'This mobile number is already registered. Please log in.'
    );
  }

  const passwordHash = await bcrypt.hash(
    data.password,
    BCRYPT_ROUNDS
  );

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

    include: {
      users: true,
    },
  });

  const user = business.users[0];

  await createSession(user, req, res);

  try {
    await sendVerificationOtp(user);
  } catch (err) {
    console.error('Signup verification email failed.');

    return res.status(err.status || 503).json({
      error: err.message,
      accountCreated: true,
      nextStep: 'verify-email',
    });
  }

  res.status(201).json(
    await profileWithAccount(user, business)
  );
});

// ---------- Login ----------

// POST /api/v1/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const data = loginSchema.parse(req.body);

  let where = null;

  // Accept either an email address or a mobile number.
  if (data.login.includes('@')) {
    where = {
      email: data.login.toLowerCase(),
    };
  } else {
    const phone = normalizePhone(data.login);

    if (phone) {
      where = { phone };
    }
  }

  const user = where
    ? await prisma.user.findUnique({
        where,
        include: {
          business: true,
        },
      })
    : null;

  const passwordMatches = await bcrypt.compare(
    data.password,
    user ? user.passwordHash : DUMMY_HASH
  );

  if (!user || !passwordMatches) {
    throw new HttpError(
      401,
      'Incorrect email/mobile number or password.'
    );
  }

  await createSession(user, req, res);

  res.json(
    await profileWithAccount(user, user.business)
  );
});

// ---------- Resend email verification OTP ----------

// POST /api/v1/auth/resend-email-otp
router.post(
  '/resend-email-otp',
  authLimiter,
  requireAuth,
  async (req, res) => {
    resendEmailOtpSchema.parse(req.body ?? {});

    const user = req.user;

    if (user.emailVerifiedAt) {
      return res.json({
        message: 'Your email is already verified.',
      });
    }

    const existing = await prisma.emailVerification.findUnique({
      where: { userId: user.id },
    });

    if (
      existing &&
      Date.now() - existing.updatedAt.getTime() <
        OTP_RESEND_WAIT_SECONDS * 1000
    ) {
      throw new HttpError(
        429,
        'Please wait 60 seconds before requesting another code.'
      );
    }

    await sendVerificationOtp(user);

    res.json({
      message: 'A new verification code has been sent to your email.',
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
  }
);

// ---------- Verify email OTP ----------

// POST /api/v1/auth/verify-email
router.post(
  '/verify-email',
  authLimiter,
  requireAuth,
  async (req, res) => {
    const data = verifyEmailOtpSchema.parse(req.body);
    const user = req.user;

    if (user.emailVerifiedAt) {
      return res.json({
        message: 'Your email is already verified.',
        ...(await profileWithAccount(user, req.business)),
      });
    }

    const record = await prisma.emailVerification.findUnique({
      where: { userId: user.id },
    });

    if (!record || record.expiresAt <= new Date()) {
      throw new HttpError(
        400,
        'Your verification code has expired. Request a new code.'
      );
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpError(
        429,
        'Too many incorrect codes. Request a new verification code.'
      );
    }

    if (hashEmailOtp(data.otp) !== record.codeHash) {
      await prisma.emailVerification.updateMany({
        where: {
          userId: user.id,
          codeHash: record.codeHash,
          attempts: { lt: OTP_MAX_ATTEMPTS },
        },

        data: {
          attempts: { increment: 1 },
        },
      });

      throw new HttpError(
        400,
        'Incorrect verification code. Please try again.'
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
        },
      }),

      prisma.emailVerification.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    const verifiedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        business: true,
      },
    });

    res.json(
      await profileWithAccount(
        verifiedUser,
        verifiedUser.business
      )
    );
  }
);

// ---------- Logout ----------

// POST /api/v1/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.cookies?.[config.session.cookieName];

  if (token) {
    await prisma.session.deleteMany({
      where: {
        tokenHash: hashToken(token),
      },
    });
  }

  clearSessionCookie(res);

  res.json({ ok: true });
});

// ---------- Current user ----------

// GET /api/v1/auth/me
router.get('/me', requireAuth, async (req, res) => {
  res.json(
    await profileWithAccount(req.user, req.business)
  );
});

// ---------- Forgot password ----------

// POST /api/v1/auth/forgot-password
router.post(
  '/forgot-password',
  authLimiter,
  async (req, res) => {
    const data = forgotSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (user) {
      // Only the newest unused reset link remains valid.
      await prisma.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
      });

      const token = newToken();

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(
            Date.now() +
              config.passwordReset.minutes * 60 * 1000
          ),
        },
      });

      const link =
        `${config.appUrl}/reset-password.html?token=` +
        encodeURIComponent(token);

      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Ventrix AI password',

          text:
            `Hi ${user.fullName},\n\n` +
            `Click the link below to set a new password. ` +
            `It works for ${config.passwordReset.minutes} minutes.\n\n` +
            `${link}\n\n` +
            'If you did not ask for this, you can ignore this email.\n\n' +
            '— Ventrix AI',
        });
      } catch (err) {
        console.error(
          'Could not send password reset email:',
          err.message
        );
      }
    }

    // Avoid revealing whether the email is registered.
    res.json({
      message:
        'If an account exists for that email, a reset link has been sent.',
    });
  }
);

// ---------- Reset password ----------

// POST /api/v1/auth/reset-password
router.post(
  '/reset-password',
  authLimiter,
  async (req, res) => {
    const data = resetSchema.parse(req.body);

    const record = await prisma.passwordResetToken.findUnique({
      where: {
        tokenHash: hashToken(data.token),
      },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new HttpError(
        400,
        'This reset link is invalid or has expired. Please request a new one.'
      );
    }

    const passwordHash = await bcrypt.hash(
      data.password,
      BCRYPT_ROUNDS
    );

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),

      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: {
          usedAt: new Date(),
        },
      }),

      // Invalidate sessions after a password change.
      prisma.session.deleteMany({
        where: { userId: record.userId },
      }),
    ]);

    res.json({
      message: 'Your password has been updated. Please log in.',
    });
  }
);

module.exports = router;
