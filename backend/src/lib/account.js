
const config = require('../config');
const prisma = require('./prisma');

async function hasActivePlan(businessId) {
  const plan = await prisma.subscription.findFirst({
    where: {
      businessId,
      status: 'ACTIVE',
      OR: [
        { currentPeriodEnd: null },
        { currentPeriodEnd: { gt: new Date() } },
      ],
    },
  });

  return Boolean(plan);
}

async function accountStatus(user) {
  const paid =
    config.dev.skipPayment || (await hasActivePlan(user.businessId));

  // Email verification is mandatory, including during development.
  const emailVerified = Boolean(user.emailVerifiedAt);

  const phoneVerified =
    config.dev.skipPhoneVerify || Boolean(user.phoneVerifiedAt);

  let nextStep = 'dashboard';

  if (!emailVerified) {
    nextStep = 'verify-email';
  } else if (!paid) {
    nextStep = 'payment';
  } else if (!phoneVerified) {
    nextStep = 'verify-phone';
  }

  return { paid, emailVerified, phoneVerified, nextStep };
}

module.exports = { accountStatus };
