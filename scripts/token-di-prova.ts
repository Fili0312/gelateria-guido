import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createSessionToken } from '../src/server/auth/session-token.js';

/**
 * Stampa un cookie di sessione valido, firmato con SESSION_SECRET.
 *
 * Serve a verificare le schermate e le API dall'esterno senza conoscere la
 * password condivisa: il token e' stateless e firmato, quindi ricavarlo dal
 * segreto e' esattamente cio' che fa il login dopo aver verificato la
 * password. Non e' una scorciatoia di sicurezza — chi ha SESSION_SECRET puo'
 * gia' fare tutto.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx scripts/token-di-prova.ts
 */

const connectionString = process.env.DATABASE_URL;
const secret = process.env.SESSION_SECRET;
if (!connectionString) throw new Error('DATABASE_URL mancante.');
if (!secret) throw new Error('SESSION_SECRET mancante.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const utente = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!utente) throw new Error('Nessun utente nel database.');

  const token = createSessionToken(
    { userId: utente.id, organizationId: utente.organizationId },
    secret!,
    { durationSeconds: 900 },
  );
  console.log(token);
  await prisma.$disconnect();
}

void main();
