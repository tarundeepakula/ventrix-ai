// Works out where an account is in the setup steps:
//   signup -> payment -> verify-phone -> dashboard
// The pages ask /auth/me and follow account.nextStep.
const config = require('../config');
const prisma = require('./prisma');

async function hasActivePlan(businessId) {
  const plan = await prisma.subscription.findFirst({
    where: {
      businessId,
      status: 'ACTIVE',
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
    },
  });
  return Boolean(plan);
}

async function accountStatus(user) {
  const paid = config.dev.skipPayment || (await hasActivePlan(user.businessId));
  const phoneVerified = config.dev.skipPhoneVerify || Boolean(user.phoneVerifiedAt);

  let nextStep = 'dashboard';
  if (!paid) nextStep = 'payment';
  else if (!phoneVerified) nextStep = 'verify-phone';

  return { paid, phoneVerified, nextStep };
}

module.exports = { accountStatus };