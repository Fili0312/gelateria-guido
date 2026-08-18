import { systemPrisma } from '../src/server/database/system-client.js';
import { estraiMarche } from '../src/server/catalog/immagini/marche.js';

/**
 * Riempie la marca dei prodotti chiedendola al modello.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/marche-prodotti.ts [--massimo 100] [--rifai]
 *
 * Va lanciato **prima** di `foto-prodotti.ts`: senza la marca la ricerca
 * delle foto non ha modo di pretendere che la scheda trovata sia dello
 * stesso produttore, e ripiega su una regola molto più severa che trova
 * quasi niente.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');

function argomento(nome: string): string | null {
  const dove = process.argv.indexOf(nome);
  return dove >= 0 ? (process.argv[dove + 1] ?? null) : null;
}

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const massimo = Number(argomento('--massimo') ?? '1000');

  const esito = await estraiMarche(org.id, {
    massimo,
    rifai: process.argv.includes('--rifai'),
  });

  console.log(
    `${esito.esaminati} esaminati · ${esito.conMarca} con marca · ` +
      `${esito.senzaMarca} senza · ${esito.chiamate} chiamate al modello`,
  );
}

main()
  .catch((errore: unknown) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => systemPrisma.$disconnect());
