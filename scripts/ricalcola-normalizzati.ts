import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { nucleoDescrizione } from '../src/server/domain/packaging/parse.js';

/**
 * Riscrive i nomi normalizzati con la funzione canonica.
 *
 * Serve in due momenti, entrambi prevedibili:
 *
 *  - dopo una migrazione che ha riempito la colonna con un'approssimazione
 *    in SQL (che non espande le abbreviazioni e non toglie i formati);
 *  - dopo ogni modifica a `normalizzaTesto` o al parser dei formati, perche'
 *    da quel momento i valori gia' a database sono calcolati con una regola
 *    diversa da quella che usera' la ricerca. Senza questo passaggio la
 *    ricerca troverebbe cose diverse a seconda di quando e' stata scritta la
 *    riga — un guasto silenzioso e difficile da attribuire.
 *
 * Uso:
 *   pnpm ricalcola-normalizzati            # scrive
 *   pnpm ricalcola-normalizzati -- --prova # mostra soltanto cosa cambierebbe
 */

const soloProva = process.argv.includes('--prova');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL mancante.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const LOTTO = 500;

async function ricalcolaProdotti(): Promise<number> {
  let cambiati = 0;
  let cursore: string | undefined;

  for (;;) {
    const lotto = await prisma.product.findMany({
      take: LOTTO,
      ...(cursore ? { skip: 1, cursor: { id: cursore } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, name: true, normalizedName: true },
    });
    if (lotto.length === 0) break;
    cursore = lotto.at(-1)!.id;

    for (const riga of lotto) {
      const atteso = nucleoDescrizione(riga.name) || 'senza nome';
      if (atteso === riga.normalizedName) continue;
      if (!soloProva) {
        await prisma.product.update({ where: { id: riga.id }, data: { normalizedName: atteso } });
      }
      console.log(`  prodotto  ${riga.normalizedName}  ->  ${atteso}`);
      cambiati++;
    }
  }
  return cambiati;
}

async function ricalcolaProdottiFornitore(): Promise<number> {
  let cambiati = 0;
  let cursore: string | undefined;

  for (;;) {
    const lotto = await prisma.supplierProduct.findMany({
      take: LOTTO,
      ...(cursore ? { skip: 1, cursor: { id: cursore } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, rawName: true, normalizedName: true },
    });
    if (lotto.length === 0) break;
    cursore = lotto.at(-1)!.id;

    for (const riga of lotto) {
      const atteso = nucleoDescrizione(riga.rawName) || 'senza nome';
      if (atteso === riga.normalizedName) continue;
      if (!soloProva) {
        await prisma.supplierProduct.update({
          where: { id: riga.id },
          data: { normalizedName: atteso },
        });
      }
      console.log(`  fornitore ${riga.normalizedName}  ->  ${atteso}`);
      cambiati++;
    }
  }
  return cambiati;
}

async function main() {
  if (soloProva) console.log('MODALITA PROVA: nessuna scrittura.\n');

  const prodotti = await ricalcolaProdotti();
  const fornitore = await ricalcolaProdottiFornitore();

  console.log(
    `\n${soloProva ? 'Da aggiornare' : 'Aggiornati'}: ` +
      `${prodotti} prodotti canonici, ${fornitore} prodotti fornitore.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (errore) => {
    console.error(errore);
    await prisma.$disconnect();
    process.exit(1);
  });
