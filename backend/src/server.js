// Starts the server. Run with: npm run dev
const config = require('./config');
const app = require('./app');

const server = app.listen(config.port, (error) => {
  if (error) {
    console.error('Server could not start:', error.message);
    process.exit(1);
  }
  console.log(`Ventrix AI backend running at ${config.appUrl}`);

  if (config.dev.skipPayment) console.warn('DEV MODE: payment step is skipped (DEV_SKIP_PAYMENT=true)');
  if (config.dev.skipPhoneVerify) console.warn('DEV MODE: phone verification is skipped (DEV_SKIP_PHONE_VERIFY=true)');
});

// Stop cleanly when you press Ctrl + C
function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);