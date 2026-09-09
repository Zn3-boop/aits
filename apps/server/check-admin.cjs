const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findUnique({ where: { username: "admin" } });
  if (user) {
    console.log("Admin found:", JSON.stringify({ id: user.id, username: user.username, password_prefix: user.password.substring(0, 10), role: user.role }));
  } else {
    console.log("Admin not found!");
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
