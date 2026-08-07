import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Client Prisma condiviso.
 *
 * In sviluppo Next ricarica i moduli a ogni modifica: senza la cache su
 * `globalThis` ogni ricarica aprirebbe un nuovo pool di connessioni, e dopo
 * qualche minuto Postgres rifiuterebbe di aprirne altre.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL mancante: copiare .env.example in .env e impostarla. ' +
      '(In produzione la legge systemd da EnvironmentFile.)',
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
