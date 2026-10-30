
const express = require("express");
const { z } = require("zod");
const prisma = require("../../lib/prisma");
const { requireAuth, requireActive } = require("../../middleware/auth");

const router = express.Router();

const contactSchema = z.object({
  name: z.string().trim().min(1, "Contact name is required").max(100),
  phone: z.string().trim().min(5, "Enter a valid phone number").max(25),
});

router.use(requireAuth);
router.use(requireActive);

// List contacts for the logged-in business

router.get("/", async (req, res, next) => {
  try {
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );

    const where = {
      businessId: req.businessId,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [contacts, total] = await prisma.$transaction([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({
      success: true,
      contacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});
module.exports = router;