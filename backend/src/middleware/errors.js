// Turns any error into a clean JSON reply the frontend can show.
const { ZodError } = require('zod');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

// Express recognises an error handler by its four arguments, so keep `next`.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: err.issues[0]?.message || 'Please check the details you entered.',
      fields: err.flatten().fieldErrors,
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request body.' });
  }
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'That record already exists.' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
  });
}

module.exports = { HttpError, notFound, errorHandler };
