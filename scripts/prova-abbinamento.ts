import { abbinaTutte, riepiloga, type RigaDaAbbinare } from '../src/server/import/matching/cascata.js';
import { systemPrisma } from '../src/server/database/system-client.js';

/**
 * Fa girare la cascata di abbinamento sui listini già importati, **senza
 * scrivere niente**.
 *
 * Serve a vedere cosa proporrebbe prima di lasciargliela applicare, e a
 * tarare le soglie sui dati veri invece che a occhio.
 *
 * ATTENZIONE: legge soltanto, ma va comunque puntato su una copia — la
 * cascata è pesante e su un database in uso ruberebbe connessioni.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo \
 *     tsx --conditions=react-server scripts/prova-abbinamento.ts
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === '/gelateria_guido') {
  throw new Error('Puntalo su una copia: la cascata e pesante.');
}

interface CampiRiga {
  codice?: string | null;
  descrizione?: string | null;
  unitaDiVendita?: string | null;
}

async function main() {
  const listini = await systemPrisma.priceList.findMany({
    select: { id: true, scopeLabel: true, supplierId: true, organizationId: true,
      supplier: { select: { name: true } } },
    orderBy: { uploadedAt: 'asc' },
  });

  for (const listino of listini) {
    const righe = await systemPrisma.priceListRow.findMany({
      where: { priceListId: listino.id },
      select: { id: true, extracted: true },
      orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }],
    });

    const daAbbinare: RigaDaAbbinare[] = [];
    for (const riga of righe) {
      const e = riga.extracted as { tipo?: string; campi?: CampiRiga } | null;
      if (e?.tipo !== 'prodotto' || !e.campi?.descrizione) continue;
      daAbbinare.push({
        chiave: riga.id,
        codiceFornitore: e.campi.codice ?? null,
        descrizione: e.campi.descrizione,
        unitaDiVendita: e.campi.unitaDiVendita ?? null,
      });
    }

    const inizio = Date.now();
    const esiti = await abbinaTutte(daAbbinare, {
      organizationId: listino.organizationId,
      supplierId: listino.supplierId,
    });
    const r = riepiloga(esiti);
    const secondi = ((Date.now() - inizio) / 1000).toFixed(1);

    console.log(`\n═══ ${listino.supplier.name} / ${listino.scopeLabel} — ${daAbbinare.length} righe in ${secondi}s`);
    console.log(`  gia noti ${r.giaNoti} · automatici ${r.automatici} · da rivedere ${r.daRivedere} · nuovi ${r.nuovi}`);

    const conCandidati = esiti.filter((e) => e.candidati.length > 0);
    if (conCandidati.length > 0) {
      console.log(`  ${conCandidati.length} righe con almeno un candidato. Prime 8:`);
      for (const e of conCandidati.slice(0, 8)) {
        const c = e.candidati[0]!;
        console.log(
          `    [${e.decisione.esito.padEnd(7)}] ${e.nucleo.slice(0, 40).padEnd(42)} → ${c.nome.slice(0, 38)}`,
        );
        console.log(
          `                punteggio ${c.punteggio.punteggio} (trigram ${c.punteggio.trigram}, parole ${c.punteggio.parole}) via ${c.via}`,
        );
      }
    }
  }

  await systemPrisma.$disconnect();
}

main().catch(async (e: unknown) => {
  console.error(e);
  await systemPrisma.$disconnect();
  process.exitCode = 1;
});
