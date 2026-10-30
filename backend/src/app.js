
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");

const prisma = require("./lib/prisma");
const authRoutes = require("./modules/auth/auth.routes");
const phoneRoutes = require("./modules/auth/phones.routes");
const contactRoutes = require("./modules/contacts/contacts.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const { errorHandler } = require("./middleware/errors");

const app = express();

app.disable("x-powered-by");

// Allow the frontend to communicate with the backend.
app.use(
  cors({
    origin: [
      "http://127.0.0.1:5500",
      "http://localhost:5500"
    ],
    credentials: true
  })
);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

// Check API and database connectivity.
app.get("/api/v1/health", async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "Ventrix AI API is running",
      database: "connected",
    });
  } catch (error) {
    next(error);
  }
});

// Register API routes.
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/auth/phone", phoneRoutes);
app.use("/api/v1/contacts", contactRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);

// Serve the existing website.
app.use(express.static(path.join(__dirname, "../public")));

// Unknown API endpoints.
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});

// Unknown website pages.
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Error handler must be last.
app.use(errorHandler);

module.exports = app;
