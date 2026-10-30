
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const config = require('../../config');
const prisma = require('../../lib/prisma');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many verification requests. Please try again later.',
  },
});

function normalizePhone(value) {
  if (typeof value !== 'string') return null;

  let digits = value.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) digits = '91' + digits;

  if (digits.length < 11 || digits.length > 15) return null;

  return '+' + digits;
}

function getOtpSecret() {
  const secret = process.env.PHONE_OTP_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('PHONE_OTP_SECRET must contain at least 32 characters.');
  }

  return secret;
}

function hashOtp(userId, phone, code) {
  return crypto
    .createHmac('sha256', getOtpSecret())
    .update(`${userId}:${phone}:${code}`)
    .digest('hex');
}

function hashesMatch(a, b) {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');

  return left.length === right.length &&
    crypto.timingSafeEqual(left, right);
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

async function issueCode(userId, phone) {
  const code = generateOtp();

  await prisma.phoneVerification.upsert({
    where: { userId },
    create: {
      userId,
      phone,
      codeHash: hashOtp(userId, phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
    },
    update: {
      phone,
      codeHash: hashOtp(userId, phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
    },
  });

  // Local testing only. Never log OTPs in production.
  if (config.nodeEnv !== 'production' &&
      process.env.PHONE_OTP_DEV_LOG === 'true') {
    console.log(`[DEV ONLY] Phone OTP for ${phone}: ${code}`);
  }

  return code;
}

router.use(requireAuth);

// POST /api/v1/auth/phone/send-code
router.post('/send-code', otpLimiter, async (req, res) => {
  if (req.user.phoneVerifiedAt) {
    return res.json({
      success: true,
      message: 'Your phone number is already verified.',
    });
  }

  // Real delivery is not configured yet.
  // Development may create a code for local testing only.
  if (
    config.isProd ||
    process.env.PHONE_OTP_DEV_LOG !== 'true'
  ) {
    return res.status(503).json({
      success: false,
      message: 'Phone verification delivery is not configured yet.',
    });
  }

  await issueCode(req.user.id, req.user.phone);

  return res.json({
    success: true,
    message: 'Development OTP generated. Check the backend terminal.',
    developmentOnly: true,
  });
});

// POST /api/v1/auth/phone/change
router.post('/change', otpLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Enter a valid phone number.',
    });
  }

  if (phone === req.user.phone) {
    return res.status(400).json({
      success: false,
      message: 'Enter a different phone number.',
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { phone },
    select: { id: true },
  });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'This phone number is already registered.',
    });
  }

  if (
    config.isProd ||
    process.env.PHONE_OTP_DEV_LOG !== 'true'
  ) {
    return res.status(503).json({
      success: false,
      message: 'Phone verification delivery is not configured yet.',
    });
  }

  await issueCode(req.user.id, phone);

  return res.json({
    success: true,
    message: 'Development OTP generated. Check the backend terminal.',
    developmentOnly: true,
  });
});

// POST /api/v1/auth/phone/verify
router.post('/verify', otpLimiter, async (req, res) => {
  const code = String(req.body?.code ?? req.body?.otp ?? '');

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({
      success: false,
      message: 'Enter the six-digit verification code.',
    });
  }

  const verification = await prisma.phoneVerification.findUnique({
    where: { userId: req.user.id },
  });

  if (!verification) {
    return res.status(400).json({
      success: false,
      message: 'Request a verification code first.',
    });
  }

  if (verification.expiresAt <= new Date()) {
    await prisma.phoneVerification.deleteMany({
      where: { userId: req.user.id },
    });

    return res.status(400).json({
      success: false,
      message: 'The code has expired. Request a new one.',
    });
  }

  if (verification.attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Request a new code later.',
    });
  }

  const expectedHash = hashOtp(
    req.user.id,
    verification.phone,
    code
  );

  if (!hashesMatch(expectedHash, verification.codeHash)) {
    const updated = await prisma.phoneVerification.update({
      where: { userId: req.user.id },
      data: { attempts: { increment: 1 } },
    });

    return res.status(
      updated.attempts >= MAX_ATTEMPTS ? 429 : 400
    ).json({
      success: false,
      message: updated.attempts >= MAX_ATTEMPTS
        ? 'Too many attempts. Request a new code later.'
        : 'Incorrect verification code.',
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.user.id },
        data: {
          phone: verification.phone,
          phoneVerifiedAt: new Date(),
        },
      });

      await tx.phoneVerification.delete({
        where: { userId: req.user.id },
      });
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'This phone number is already registered.',
      });
    }
    throw error;
  }

  return res.json({
    success: true,
    message: 'Phone number verified successfully.',
    account: {
      phoneVerified: true,
      nextStep: (
        config.dev.skipPayment ||
        await prisma.subscription.findFirst({
          where: {
            businessId: req.user.businessId,
            status: 'ACTIVE',
            OR: [
              { currentPeriodEnd: null },
              { currentPeriodEnd: { gt: new Date() } },
            ],
          },
        })
      ) ? 'dashboard' : 'payment',
    },
  });
});

module.exports = router;
