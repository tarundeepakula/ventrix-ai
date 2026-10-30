
require("dotenv").config();
const { Resend } = require("resend");

async function main() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing from .env");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: "Ventrix AI <onboarding@resend.dev>",
    to: ["tarundeepakula@gmail.com"],
    subject: "Ventrix AI - Email Test",
    html: "<h2>Ventrix AI</h2><p>Your Resend email setup is working.</p>",
  });

  if (error) {
    console.error("Email failed:", error);
    process.exitCode = 1;
    return;
  }

  console.log("Email accepted by Resend:", data);
}

main().catch(console.error);
