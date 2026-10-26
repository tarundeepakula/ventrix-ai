// Starts the server. Run with: npm run dev
const config = require('./config');
const app = require('./app');

const server = app.listen(config.port, (error) => {
  if (error) {
    console.error('Server could not start:', error.message);
    process.exit(1);
  }
  console.log(`Ventrix AI backend running at ${config.appUrl}`);
});

// Stop cleanly when you press Ctrl + C
function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);