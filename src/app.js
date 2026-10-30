const express = require("express");
const helmet = require("helmet");
const path = require("path");

const app = express();

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Ventrix AI API is running",
    database: "not connected yet"
  });
});

app.use(express.static(path.join(__dirname, "../public")));

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

app.use((req, res) => {
  res.status(404).send("Page not found");
});

module.exports = app;
