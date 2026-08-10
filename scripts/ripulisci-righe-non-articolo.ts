import { systemPrisma } from '../src/server/database/system-client';
import { eArticolo } from '../src/server/import/riga-articolo';

/**
 * Chiude le righe non-articolo rimaste in coda dagli import già fatti.
 *
 *   tsx --conditions=react-server scripts/ripulisci-righe-non-articolo.ts        # mostra e basta
 *   tsx --conditions=react-server scripts/ripulisci-righe-non-articolo.ts --scrivi
 *
 * La regola è la stessa che ora si applica in fase di import: quello che
 * cambia qui è solo che si applica a ciò che era già stato scritto prima.
 *
 * **Elenca prima di scrivere, e senza `--scrivi` non tocca niente.** È una
 * scrittura su righe che una persona potrebbe aver già rivisto, e il modo di
 * accorgersi di un errore è vedere l'elenco prima, non dopo.
 */

async function main() {
  const scrivi = process.argv.includes('--scrivi');

  const righe = await systemPrisma.priceListRow.findMany({
    where: { matchStatus: 'PENDING', excluded: false },
    select: {
      id: true,
      rawText: true,
      extracted: true,
      pageNumber: true,
      reviewedById: true,
      priceList: { select: { supplier: { select: { name: true } }, scopeLabel: true } },
    },
    orderBy: [{ priceListId: 'asc' }, { pageNumber: 'asc' }, { lineNumber: 'asc' }],
  });

  const daChiudere: typeof righe = [];
  const restano: typeof righe = [];
  for (const riga of righe) {
    const estratto = riga.extracted as { tipo?: string; campi?: unknown } | null;
    const articolo = eArticolo({
      tipo: (estratto?.tipo ?? 'ignota') as 'prodotto' | 'sezione' | 'intestazione' | 'ignota',
      campi: estratto?.campi ?? null,
    });
    (articolo ? restano : daChiudere).push(riga);
  }

  console.log(`\n${righe.length} righe in coda.\n`);
  console.log(`── ${daChiudere.length} da chiudere: non sono articoli ──\n`);
  for (const r of daChiudere) {
    const tipo = (r.extracted as { tipo?: string } | null)?.tipo ?? '?';
    const rivista = r.reviewedById ? ' ⚠ già rivista da una persona' : '';
    console.log(
      `  ${r.priceList.supplier.name}/${r.priceList.scopeLabel} p${r.pageNumber} [${tipo}] ${r.rawText.slice(0, 62)}${rivista}`,
    );
  }
  if (restano.length > 0) {
    console.log(`\n── ${restano.length} restano in coda: sono articoli veri ──\n`);
    for (const r of restano) console.log(`  ${r.rawText.slice(0, 70)}`);
  }

  if (!scrivi) {
    console.log('\n(prova a vuoto: rilancia con --scrivi per applicare)\n');
    await systemPrisma.$disconnect();
    return;
  }

  const esito = await systemPrisma.priceListRow.updateMany({
    where: { id: { in: daChiudere.map((r) => r.id) } },
    // Lo stesso stato di «Ignora questa riga», ma senza revisore: la
    // decisione l'ha presa il sistema.
    data: { matchStatus: 'IGNORED', proposedAction: 'IGNORE', excluded: true },
  });
  console.log(`\n✓ ${esito.count} righe chiuse. Restano ${restano.length} in coda.\n`);
  await systemPrisma.$disconnect();
}

main().catch(async (errore: unknown) => {
  console.error(errore);
  await systemPrisma.$disconnect();
  process.exit(1);
});
