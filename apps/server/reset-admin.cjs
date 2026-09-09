const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();
async function main() {
  const hashed = await bcrypt.hash("admin123", 12);
  const user = await prisma.user.update({
    where: { username: "admin" },
    data: { password: hashed }
  });
  console.log("Admin password reset OK, new prefix:", user.password.substring(0, 10));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
