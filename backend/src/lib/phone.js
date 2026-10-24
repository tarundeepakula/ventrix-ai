// Turns any way people write a phone number into one standard format.
// "+91 98765 43210", "98765-43210", "09876543210", "919876543210"
// all become "+919876543210". Numbers without a country code are treated as Indian.
function normalizePhone(value) {
  if (value === null || value === undefined) return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length < 11 || digits.length > 15) return null;
  return '+' + digits;
}

// "+919876543210" -> "+91 98765 43210" (for showing on screen)
function formatPhone(e164) {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164 || '');
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

module.exports = { normalizePhone, formatPhone };
