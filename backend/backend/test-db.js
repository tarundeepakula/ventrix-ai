
const prisma = require("./src/lib/prisma");

async function main() {
  await prisma.$connect();

  const result = await prisma.$queryRaw`SELECT 1 AS connected`;

  console.log("Database connection successful!");
  console.log(result);
}

main()
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
