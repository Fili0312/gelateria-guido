import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Client non scoped riservato a infrastruttura e bootstrap.
 *
 * Non importarlo da repository, route di dominio o componenti applicativi:
 * quelle parti devono usare esclusivamente `prismaForOrganization` da
 * `@/server/db`. Tenere il client grezzo in un modulo dal nome esplicito rende
 * una deroga visibile in review.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL mancante: copiare .env.example in .env e impostarla. ' +
      '(In produzione la legge systemd da EnvironmentFile.)',
  );
}

const globalForPrisma = globalThis as unknown as { systemPrisma?: PrismaClient };

export const systemPrisma =
  globalForPrisma.systemPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.systemPrisma = systemPrisma;
}
