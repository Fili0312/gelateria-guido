import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { systemPrisma } from '../src/server/database/system-client.js';
import { percorsoAssoluto } from '../src/server/import/storage.js';

/**
 * Toglie le foto arrivate da Open Food Facts, lasciando le altre.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/togli-foto-open-food-facts.ts --scrivi
 *
 * ── Perché ──────────────────────────────────────────────────────────────
 * Sono foto caricate dai volontari di un archivio alimentare: bottiglie
 * fotografate sul tavolo di cucina, storte, con lo sfondo di casa. Accanto
 * a un prezzo e a un bottone d'ordine non aiutano a riconoscere il
 * prodotto — che è l'unica cosa per cui una foto è lì — e in mezzo alle
 * immagini ufficiali dei fornitori stonano al punto da far sembrare
 * sbagliata la pagina.
 *
 * I prodotti restano segnati come **già cercati**, così nessun giro
 * automatico va a riprenderle. Un `--riprova` esplicito le rimetterebbe:
 * per questo, se la fonte non serve più, va spenta a monte e non qui.
 *
 * I file sul disco si cancellano solo se non li usa più nessuno: sono
 * indirizzati dal contenuto, e due prodotti possono condividerne uno.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');

async function main() {
  const scrivi = process.argv.includes('--scrivi');

  const daTogliere = await systemPrisma.product.findMany({
    where: { imageSource: 'OFF' },
    select: { id: true, name: true, imagePath: true },
    orderBy: { name: 'asc' },
  });
  const restano = await systemPrisma.product.count({
    where: { imagePath: { not: null }, imageSource: { not: 'OFF' } },
  });

  console.log(`${daTogliere.length} foto da Open Food Facts da togliere`);
  console.log(`${restano} foto di altra provenienza restano dove sono\n`);
  if (daTogliere.length === 0) return;

  if (!scrivi) {
    for (const p of daTogliere.slice(0, 10)) console.log(`  · ${p.name}`);
    if (daTogliere.length > 10) console.log(`  · … e altri ${daTogliere.length - 10}`);
    console.log('\nNulla è stato scritto. Rilancia con --scrivi.');
    return;
  }

  const { count } = await systemPrisma.product.updateMany({
    where: { imageSource: 'OFF' },
    data: {
      imagePath: null,
      imageExternalId: null,
      imageConfidence: null,
      // «Cercato, niente da tenere»: senza questo il primo riempimento
      // notturno le riscaricherebbe tutte.
      imageSource: 'NONE',
      imageUpdatedAt: new Date(),
    },
  });
  console.log(`${count} prodotti senza più foto.`);

  // ── I file rimasti senza padrone ──────────────────────────────────────
  const usati = new Set(
    (
      await systemPrisma.product.findMany({
        where: { imagePath: { not: null } },
        select: { imagePath: true },
      })
    ).map((p) => p.imagePath!),
  );

  let cancellati = 0;
  const radice = percorsoAssoluto('immagini');
  for (const sotto of await readdir(radice).catch(() => [])) {
    for (const file of await readdir(join(radice, sotto)).catch(() => [])) {
      const relativo = join('immagini', sotto, file);
      if (usati.has(relativo)) continue;
      await rm(join(radice, sotto, file), { force: true });
      cancellati += 1;
    }
  }
  console.log(`${cancellati} file cancellati dal disco perché non li usava più nessuno.`);
}

main()
  .catch((errore: unknown) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => systemPrisma.$disconnect());
