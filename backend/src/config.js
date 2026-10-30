
require("dotenv").config();

const nodeEnv = process.env.NODE_ENV || "development";

module.exports = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv,
  isProd: nodeEnv === "production",

  appUrl: process.env.APP_URL || "http://localhost:4000",

  session: {
    cookieName: "ventrix_session",
    days: 7,
  },

  passwordReset: {
    minutes: 30,
  },

  dev: {
    skipPayment:
      nodeEnv !== "production" &&
      process.env.DEV_SKIP_PAYMENT === "true",

    skipPhoneVerify:
      nodeEnv !== "production" &&
      process.env.DEV_SKIP_PHONE_VERIFY === "true",
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    from:
      process.env.RESEND_FROM ||
      "Ventrix AI <onboarding@resend.dev>",
  },

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  },
};
