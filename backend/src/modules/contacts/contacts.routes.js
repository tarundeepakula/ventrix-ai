// Contacts: list, search, add, edit, delete, import from Excel/CSV, export, duplicates.
// All routes live under /api/v1/contacts and only ever touch the
// logged-in user's own business (every query includes businessId).
const express = require('express');
const { z } = require('zod');

const prisma = require('../../lib/prisma');
const { normalizePhone, formatPhone } = require('../../lib/phone');
const { requireAuth } = require('../../middleware/auth');
const { HttpError } = require('../../middleware/errors');

const router = express.Router();

const LANGUAGES = [
  'English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam',
  'Marathi', 'Gujarati', 'Bengali', 'Punjabi', 'Odia', 'Urdu',
];
const TAGS = ['Customer', 'Hot Lead', 'Interested', 'Follow-up'];
const MAX_IMPORT_ROWS = 1000; // per request; the page sends big files in parts

// ---------- Input rules ----------

// Optional text: "" becomes null so a field can be cleared.
const optionalText = (max) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();

const phoneField = z
  .string()
  .transform(normalizePhone)
  .refine((v) => v !== null, 'Enter a valid WhatsApp number, e.g. +91 98765 43210.');

const contactFields = {
  name: z.string().trim().min(1, 'Enter a name.').max(100),
  phone: phoneField,
  language: z.enum(LANGUAGES, { message: 'Choose a language from the list.' }),
  tag: z.enum(TAGS, { message: 'Choose a tag from the list.' }),
  city: optionalText(80),
  email: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email address.')
    .nullable()
    .optional(),
  notes: optionalText(1000),
  optedIn: z.boolean(),
};

const createSchema = z.object({
  ...contactFields,
  language: contactFields.language.default('English'),
  tag: contactFields.tag.default('Customer'),
  optedIn: contactFields.optedIn.default(true),
});
const updateSchema = z.object(contactFields).partial();

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  language: z.string().optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------- Helpers ----------

// What the page receives for one contact.
function publicContact(c) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    phoneDisplay: formatPhone(c.phone),
    language: c.language,
    tag: c.tag,
    city: c.city,
    email: c.email,
    notes: c.notes,
    optedIn: c.optedIn,
    source: c.source,
    lastInboundAt: c.lastInboundAt,
    createdAt: c.createdAt,
  };
}

// Builds the database filter from ?search=&language=&tag=
function buildWhere(businessId, { search, language, tag }) {
  const where = { businessId };
  if (language && language !== 'all') where.language = language;
  if (tag && tag !== 'all') where.tag = tag;
  if (search) {
    const or = [{ name: { contains: search, mode: 'insensitive' } }];
    const digits = search.replace(/\D/g, '');
    if (digits.length >= 3) or.push({ phone: { contains: digits } });
    where.OR = or;
  }
  return where;
}

async function findOwnContact(businessId, id) {
  const contact = await prisma.contact.findFirst({ where: { id, businessId } });
  if (!contact) throw new HttpError(404, 'Contact not found.');
  return contact;
}

function isDuplicatePhoneError(err) {
  return err && err.code === 'P2002';
}

// Matches spreadsheet column names like "Full Name", "Mobile No.", "WhatsApp Number".
const COLUMN_NAMES = {
  name: ['name', 'fullname', 'contactname', 'customername', 'customer'],
  phone: ['phone', 'phonenumber', 'phoneno', 'mobile', 'mobilenumber', 'mobileno', 'whatsapp',
    'whatsappnumber', 'whatsappno', 'number', 'contactnumber', 'contactno'],
  language: ['language', 'lang', 'preferredlanguage'],
  tag: ['tag', 'aitag', 'status', 'type', 'leadstatus'],
  city: ['city', 'location', 'town'],
  email: ['email', 'emailaddress', 'mail'],
};

function pickColumn(row, field) {
  for (const key of Object.keys(row)) {
    const clean = key.toLowerCase().replace(/[^a-z]/g, '');
    if (COLUMN_NAMES[field].includes(clean)) {
      const value = row[key];
      return value === null || value === undefined ? '' : String(value).trim();
    }
  }
  return '';
}

function matchLanguage(value) {
  if (!value) return 'English';
  const codes = { en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam',
    mr: 'Marathi', gu: 'Gujarati', bn: 'Bengali', pa: 'Punjabi', or: 'Odia', ur: 'Urdu' };
  const lower = value.toLowerCase();
  return LANGUAGES.find((l) => l.toLowerCase() === lower) || codes[lower] || 'English';
}

function matchTag(value) {
  const clean = (value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (clean.startsWith('hot')) return 'Hot Lead';
  if (clean.startsWith('interest')) return 'Interested';
  if (clean.startsWith('follow')) return 'Follow-up';
  return 'Customer';
}

// CSV cell: wrap in quotes and double any quotes inside.
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ---------- Routes ----------
// (Fixed paths like /stats come before /:id so Express doesn't mistake them for an id.)

// GET /api/v1/contacts/stats  (the 4 cards at the top of contacts.html)
router.get('/stats', requireAuth, async (req, res) => {
  const businessId = req.businessId;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [total, newThisWeek, whatsappActive, hotLeads] = await Promise.all([
    prisma.contact.count({ where: { businessId } }),
    prisma.contact.count({ where: { businessId, createdAt: { gte: weekAgo } } }),
    prisma.contact.count({ where: { businessId, lastInboundAt: { gte: monthAgo } } }),
    prisma.contact.count({ where: { businessId, tag: 'Hot Lead' } }),
  ]);

  res.json({ total, newThisWeek, whatsappActive, hotLeads });
});

// GET /api/v1/contacts/export?search=&language=&tag=  (Export button, downloads a CSV)
router.get('/export', requireAuth, async (req, res) => {
  const filters = listSchema.parse(req.query);
  const contacts = await prisma.contact.findMany({
    where: buildWhere(req.businessId, filters),
    orderBy: { name: 'asc' },
  });

  const header = ['Name', 'Phone', 'Language', 'Tag', 'City', 'Email', 'Opted In', 'Added On'];
  const lines = [header.join(',')];
  for (const c of contacts) {
    lines.push(
      [c.name, c.phone, c.language, c.tag, c.city, c.email, c.optedIn ? 'Yes' : 'No',
        c.createdAt.toISOString().slice(0, 10)].map(csvCell).join(',')
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ventrix-contacts-${date}.csv"`);
  // The \uFEFF at the start makes Excel show Telugu/Hindi names correctly.
  res.send('\uFEFF' + lines.join('\r\n'));
});

// GET /api/v1/contacts/duplicates  ("Review Duplicates")
// Finds contacts with the same name, or the same last 10 digits of phone.
router.get('/duplicates', requireAuth, async (req, res) => {
  const contacts = await prisma.contact.findMany({
    where: { businessId: req.businessId },
    orderBy: { createdAt: 'asc' },
  });

  // Contacts that share a name or a number end up in the same group,
  // even through a chain (A has B's name, B has C's number).
  const parent = new Map(contacts.map((c) => [c.id, c.id]));
  const root = (id) => {
    while (parent.get(id) !== id) id = parent.get(id);
    return id;
  };
  const reasons = new Map(); // group root -> Set of reasons
  const firstByKey = new Map();
  for (const c of contacts) {
    const keys = [
      ['Same name', 'name:' + c.name.toLowerCase().replace(/\s+/g, ' ').trim()],
      ['Similar number', 'phone:' + c.phone.slice(-10)],
    ];
    for (const [reason, key] of keys) {
      if (!firstByKey.has(key)) {
        firstByKey.set(key, c.id);
        continue;
      }
      const a = root(firstByKey.get(key));
      const b = root(c.id);
      if (a !== b) {
        parent.set(b, a);
        const merged = new Set([...(reasons.get(a) || []), ...(reasons.get(b) || [])]);
        reasons.set(a, merged);
        reasons.delete(b);
      }
      reasons.set(a, (reasons.get(a) || new Set()).add(reason));
    }
  }

  const byGroup = new Map();
  for (const c of contacts) {
    const r = root(c.id);
    if (!byGroup.has(r)) byGroup.set(r, []);
    byGroup.get(r).push(c);
  }

  const groups = [];
  let count = 0;
  for (const [r, list] of byGroup) {
    if (list.length < 2) continue;
    count += list.length;
    groups.push({ reason: [...(reasons.get(r) || [])].join(' · '), contacts: list.map(publicContact) });
  }

  res.json({ groups, count });
});

// POST /api/v1/contacts/import  (Import Excel/CSV)
// The page reads the file and sends its rows as JSON: { rows: [ {Name:..., Phone:...}, ... ] }
router.post('/import', requireAuth, async (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new HttpError(400, 'The file has no rows to import.');
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new HttpError(400, `Send at most ${MAX_IMPORT_ROWS} rows at a time.`);
  }

  const valid = [];
  const invalid = [];
  const phonesInFile = new Set();
  let duplicatesInFile = 0;

  rows.forEach((row, i) => {
    const rowNumber = Number(row?._row) || i + 2; // +2: row 1 is the header
    if (!row || typeof row !== 'object') {
      invalid.push({ row: rowNumber, reason: 'Empty row' });
      return;
    }
    const name = pickColumn(row, 'name').slice(0, 100);
    const rawPhone = pickColumn(row, 'phone');
    const phone = normalizePhone(rawPhone);

    if (!name && !rawPhone) return; // blank line: skip silently
    if (!phone) {
      invalid.push({ row: rowNumber, reason: rawPhone ? `Invalid number "${rawPhone}"` : 'No phone number' });
      return;
    }
    if (phonesInFile.has(phone)) {
      duplicatesInFile++;
      return;
    }
    phonesInFile.add(phone);

    const email = pickColumn(row, 'email');
    valid.push({
      businessId: req.businessId,
      name: name || formatPhone(phone),
      phone,
      language: matchLanguage(pickColumn(row, 'language')),
      tag: matchTag(pickColumn(row, 'tag')),
      city: pickColumn(row, 'city').slice(0, 80) || null,
      email: /^\S+@\S+\.\S+$/.test(email) ? email : null,
      source: 'import',
    });
  });

  // skipDuplicates: numbers already saved for this business are left as they are.
  const created = valid.length
    ? await prisma.contact.createMany({ data: valid, skipDuplicates: true })
    : { count: 0 };

  res.json({
    imported: created.count,
    alreadySaved: valid.length - created.count,
    duplicatesInFile,
    invalidCount: invalid.length,
    invalid: invalid.slice(0, 20), // first 20 problems, to show the user
  });
});

// GET /api/v1/contacts?search=&language=&tag=&page=&limit=  (the table)
router.get('/', requireAuth, async (req, res) => {
  const filters = listSchema.parse(req.query);
  const where = buildWhere(req.businessId, filters);

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.contact.count({ where }),
  ]);

  res.json({
    contacts: contacts.map(publicContact),
    total,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / filters.limit)),
  });
});

// POST /api/v1/contacts  (Add Contact)
router.post('/', requireAuth, async (req, res) => {
  const data = createSchema.parse(req.body);
  try {
    const contact = await prisma.contact.create({
      data: { ...data, businessId: req.businessId, source: 'manual' },
    });
    res.status(201).json({ contact: publicContact(contact) });
  } catch (err) {
    if (isDuplicatePhoneError(err)) {
      throw new HttpError(409, 'A contact with this WhatsApp number already exists.');
    }
    throw err;
  }
});

// GET /api/v1/contacts/:id
router.get('/:id', requireAuth, async (req, res) => {
  const contact = await findOwnContact(req.businessId, req.params.id);
  res.json({ contact: publicContact(contact) });
});

// PATCH /api/v1/contacts/:id  (Edit)
router.patch('/:id', requireAuth, async (req, res) => {
  const data = updateSchema.parse(req.body);
  const existing = await findOwnContact(req.businessId, req.params.id);
  try {
    const contact = await prisma.contact.update({ where: { id: existing.id }, data });
    res.json({ contact: publicContact(contact) });
  } catch (err) {
    if (isDuplicatePhoneError(err)) {
      throw new HttpError(409, 'Another contact already has this WhatsApp number.');
    }
    throw err;
  }
});

// DELETE /api/v1/contacts/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const result = await prisma.contact.deleteMany({
    where: { id: req.params.id, businessId: req.businessId },
  });
  if (result.count === 0) throw new HttpError(404, 'Contact not found.');
  res.json({ ok: true });
});

module.exports = router;
module.exports.LANGUAGES = LANGUAGES;
module.exports.TAGS = TAGS;
