const app = require("./app");
const config = require("./config");

const server = app.listen(config.port, () => {
  console.log(
    `Ventrix AI server running at http://localhost:${config.port}`
  );
  console.log(`Environment: ${config.nodeEnv}`);
});

function shutdown() {
  console.log("Shutting down Ventrix AI server...");
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
