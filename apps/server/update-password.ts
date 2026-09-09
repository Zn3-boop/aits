import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('system', 12);
  await prisma.user.update({
    where: { username: 'system' },
    data: { password: hash }
  });
  console.log('System user password updated to hashed value');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
