
const express = require('express');

const prisma = require('../../lib/prisma');
const { requireAuth, requireActive } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireActive);

// GET /api/v1/dashboard/summary
router.get('/summary', async (req, res, next) => {
  try {
    const businessId = req.businessId;

    const [totalContacts, subscription] = await Promise.all([
      prisma.contact.count({
        where: { businessId },
      }),
      prisma.subscription.findFirst({
        where: {
          businessId,
          status: 'ACTIVE',
          OR: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { gt: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      success: true,
      summary: {
        totalContacts,
        subscriptionActive: Boolean(subscription),
        subscriptionExpiresAt: subscription?.currentPeriodEnd ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
