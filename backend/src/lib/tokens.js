// Random tokens for sessions and password reset links.
// The browser or email gets the token; the database only stores its hash,
// so a leaked database cannot be used to log in as anyone.
const crypto = require('crypto');

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { newToken, hashToken };
