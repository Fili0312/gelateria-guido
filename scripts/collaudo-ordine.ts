import { execFileSync } from 'node:child_process';
import { Decimal } from 'decimal.js';
import { systemPrisma } from '../src/server/database/system-client.js';
import { ordersRepository } from '../src/server/repositories/orders.js';

/**
 * I criteri della Fase 12 verificabili senza browser, su una copia.
 *
 * Quelli che restano — «≤2 interazioni», «tutto con la sola tastiera»,
 * «nessun bersaglio troppo piccolo su tablet» — si provano con un browser
 * vero, perché sono affermazioni su cosa succede premendo, non su cosa
 * contiene il database.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo \
 *     tsx --conditions=react-server scripts/collaudo-ordine.ts
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === '/gelateria_guido') {
  throw new Error('Questo script crea e cancella ordini: puntalo su una copia.');
}
const urlPsql = url.split('?')[0]!;

function esito(ok: boolean, testo: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) process.exitCode = 1;
}

function sql(query: string): string {
  return execFileSync('psql', [urlPsql, '-Atc', query], { encoding: 'utf8' }).trim();
}

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const utente = await systemPrisma.user.findFirstOrThrow({ select: { id: true } });
  const ordini = ordersRepository(org.id);

  // Si parte puliti: la copia arriva da una produzione che può avere una bozza.
  sql('DELETE FROM order_line; DELETE FROM "order";');

  console.log('\n── La bozza è una sola ──────────────────────────────────────────\n');

  const primo = await ordini.corrente(utente.id);
  const secondo = await ordini.corrente(utente.id);
  esito(primo.id === secondo.id, `due letture trovano la stessa bozza (${primo.id})`);

  // Cinque richieste simultanee: è il caso delle due schede aperte, o del
  // doppio caricamento su rete lenta. Senza serializzazione se ne creerebbero
  // cinque, e ognuna mostrerebbe una parte della spesa.
  const contemporanee = await Promise.all(
    Array.from({ length: 5 }, () => ordini.corrente(utente.id)),
  );
  const distinti = new Set(contemporanee.map((o) => o.id));
  esito(distinti.size === 1, `cinque richieste simultanee creano una bozza sola (${distinti.size})`);
  esito(Number(sql('SELECT count(*) FROM "order"')) === 1, 'nel database c’è un ordine solo');

  console.log('\n── Aggiungere ──────────────────────────────────────────────────\n');

  const offerte = await systemPrisma.supplierProduct.findMany({
    where: { organizationId: org.id, active: true, currentPriceId: { not: null } },
    select: {
      id: true,
      rawName: true,
      supplierId: true,
      currentPrice: { select: { priceNet: true, vatRate: true } },
    },
    take: 3,
    orderBy: { rawName: 'asc' },
  });
  if (offerte.length < 2) throw new Error('Servono almeno due offerte con prezzo.');

  const a = offerte[0]!;
  const b = offerte[1]!;

  const conUna = await ordini.aggiungiRiga(utente.id, { supplierProductId: a.id, quantityPacks: 2 });
  esito(conUna.righe.length === 1, `una riga dopo la prima aggiunta`);
  esito(conUna.righe[0]!.quantityPacks === 2, 'con la quantità richiesta');

  const conDue = await ordini.aggiungiRiga(utente.id, { supplierProductId: a.id, quantityPacks: 1 });
  esito(conDue.righe.length === 1, 'aggiungere la stessa offerta NON crea una seconda riga');
  esito(conDue.righe[0]!.quantityPacks === 3, 'aumenta la quantità: 2 + 1 = 3');

  // Dieci aggiunte simultanee della stessa offerta.
  //
  // Il primo giro di questo collaudo le lasciava fallire in silenzio: nove su
  // dieci si abortivano a vicenda per conflitto di transazione, e il `catch`
  // le nascondeva. Una riga sola sopravviveva e sembrava tutto a posto,
  // mentre nove confezioni erano sparite. Ora si pretende che **nessuna**
  // fallisca e che il totale sia esatto.
  const raffica = await Promise.all(
    Array.from({ length: 10 }, () =>
      ordini
        .aggiungiRiga(utente.id, { supplierProductId: b.id, quantityPacks: 1 })
        .then(() => null)
        .catch((e: Error) => e.message),
    ),
  );
  const fallite = raffica.filter((r) => r !== null);
  if (fallite.length > 0) console.log('    motivo:', fallite[0]!.replace(/\s+/g, ' ').slice(0, 200));
  esito(
    fallite.length === 0,
    `nessuna delle dieci aggiunte simultanee fallisce (${fallite.length} fallite${fallite[0] ? `: ${fallite[0].slice(0, 70)}` : ''})`,
  );
  const dopoRaffica = await ordini.corrente(utente.id);
  const righeB = dopoRaffica.righe.filter((r) => r.supplierProductId === b.id);
  esito(righeB.length === 1, `producono una riga sola (${righeB.length})`);
  esito(
    righeB[0]?.quantityPacks === 10,
    `e la quantità è dieci, non quello che è sopravvissuto (${righeB[0]?.quantityPacks})`,
  );

  console.log('\n── I totali tornano sempre ─────────────────────────────────────\n');

  const ordine = await ordini.corrente(utente.id);
  const sommaRighe = ordine.righe.reduce((acc, r) => acc.plus(r.lineTotalNet), new Decimal(0));
  esito(
    sommaRighe.equals(new Decimal(ordine.totali.netto)),
    `la somma delle righe è il totale: ${sommaRighe} = ${ordine.totali.netto}`,
  );

  const salvato = sql('SELECT total_net FROM "order" LIMIT 1');
  esito(
    new Decimal(salvato).equals(new Decimal(ordine.totali.netto)),
    `il totale salvato nel database coincide (${salvato})`,
  );

  const confezioni = ordine.righe.reduce((n, r) => n + r.quantityPacks, 0);
  esito(confezioni === ordine.totali.confezioni, `le confezioni contate tornano (${confezioni})`);

  for (const riga of ordine.righe) {
    const atteso = new Decimal(riga.priceNet).mul(riga.quantityPacks).toDecimalPlaces(2);
    if (!atteso.equals(new Decimal(riga.lineTotalNet))) {
      esito(false, `riga «${riga.name}»: ${riga.lineTotalNet} invece di ${atteso}`);
    }
  }
  esito(true, 'ogni riga vale prezzo della confezione × confezioni');

  console.log('\n── Modificare e togliere ───────────────────────────────────────\n');

  const rigaA = ordine.righe.find((r) => r.supplierProductId === a.id)!;
  const modificato = await ordini.aggiornaRiga(utente.id, rigaA.id, { quantityPacks: 7 });
  const dopoModifica = modificato.righe.find((r) => r.id === rigaA.id)!;
  esito(dopoModifica.quantityPacks === 7, 'la quantità cambia');
  esito(
    new Decimal(dopoModifica.lineTotalNet).equals(
      new Decimal(dopoModifica.priceNet).mul(7).toDecimalPlaces(2),
    ),
    'e il totale della riga la segue',
  );
  esito(
    modificato.righe
      .reduce((acc, r) => acc.plus(r.lineTotalNet), new Decimal(0))
      .equals(new Decimal(modificato.totali.netto)),
    'e il totale dell’ordine pure',
  );

  const svuotato = await ordini.rimuoviRiga(utente.id, rigaA.id);
  esito(!svuotato.righe.some((r) => r.id === rigaA.id), 'la riga sparisce');
  esito(
    svuotato.righe
      .reduce((acc, r) => acc.plus(r.lineTotalNet), new Decimal(0))
      .equals(new Decimal(svuotato.totali.netto)),
    'e il totale si ricalcola, non si scala a mano',
  );

  console.log('\n── Cosa NON si può ordinare ────────────────────────────────────\n');

  const senzaPrezzo = await systemPrisma.supplierProduct.findFirst({
    where: { organizationId: org.id, currentPriceId: null },
    select: { id: true, rawName: true },
  });
  if (senzaPrezzo) {
    const rifiutato = await ordini
      .aggiungiRiga(utente.id, { supplierProductId: senzaPrezzo.id, quantityPacks: 1 })
      .then(() => null)
      .catch((e: Error) => e.message);
    esito(
      rifiutato !== null && /prezzo corrente/.test(rifiutato),
      `un'offerta senza prezzo corrente è rifiutata, e dice perché: «${rifiutato?.slice(0, 60)}…»`,
    );
  } else {
    console.log('  (nessuna offerta senza prezzo su cui provare)');
  }

  const inesistente = await ordini
    .aggiungiRiga(utente.id, { supplierProductId: 'non-esiste', quantityPacks: 1 })
    .then(() => null)
    .catch((e: Error) => e.message);
  esito(inesistente !== null, 'un id inventato non crea niente');

  console.log('\n── L’ordine sopravvive ─────────────────────────────────────────\n');

  const prima = await ordini.corrente(utente.id);
  // Un repository nuovo di zecca: è quello che succede a ogni richiesta HTTP,
  // e quindi a ogni refresh, chiusura e cambio di dispositivo.
  const altraSessione = ordersRepository(org.id);
  const dopo = await altraSessione.corrente(utente.id);
  esito(dopo.id === prima.id, 'una sessione nuova ritrova la stessa bozza');
  esito(
    dopo.righe.length === prima.righe.length &&
      dopo.totali.netto === prima.totali.netto,
    `con le stesse ${dopo.righe.length} righe e lo stesso totale (${dopo.totali.netto})`,
  );

  console.log('\n── Il raggruppamento per fornitore ─────────────────────────────\n');
  const finale = await ordini.corrente(utente.id);
  const sommaGruppi = finale.perFornitore.reduce((acc, g) => acc.plus(g.netto), new Decimal(0));
  esito(
    sommaGruppi.equals(new Decimal(finale.totali.netto)),
    `i totali per fornitore sommano al totale (${finale.perFornitore.length} fornitori)`,
  );

  sql('DELETE FROM order_line; DELETE FROM "order";');
  await systemPrisma.$disconnect();
  console.log('');
}

main().catch(async (errore: unknown) => {
  console.error(errore);
  await systemPrisma.$disconnect();
  process.exit(1);
});
