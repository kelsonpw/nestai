/**
 * @nestai/db
 *
 * Database access layer for NestAI. Exposes a singleton `PrismaClient`
 * (global-guarded so HMR / repeated imports in dev don't exhaust the
 * connection pool) and re-exports the generated Prisma namespace + types.
 */
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export const NESTAI_DB_VERSION = '0.0.0';
