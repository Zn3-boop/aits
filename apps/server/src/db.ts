import { Prisma, PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export const isPostgres = () => (process.env.DATABASE_URL ?? '').toLowerCase().startsWith('postgresql://');

export const queryJson = async <T = unknown>(query: Prisma.Sql) => prisma.$queryRaw<T>(query);
