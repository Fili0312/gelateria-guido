import { Decimal } from 'decimal.js';
import { systemPrisma } from '../src/server/database/system-client.js';
import { ordersRepository, OrderVersionError } from '../src/server/repositories/orders.js';

/**
 * I quattro criteri della Fase 14, su una copia.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo \
 *     tsx --conditions=react-server scripts/collaudo-conferma.ts
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === '/gelateria_guido') {
  throw new Error('Questo script conferma ordini: puntalo su una copia.');
}

function esito(ok: boolean, testo: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const utente = await systemPrisma.user.findFirstOrThrow({ select: { id: true } });
  const ordini = ordersRepository(org.id);

  await systemPrisma.orderLine.deleteMany({});
  await systemPrisma.order.deleteMany({});

  const offerte = await systemPrisma.supplierProduct.findMany({
    where: { organizationId: org.id, active: true, currentPriceId: { not: null } },
    select: { id: true, supplierId: true, supplier: { select: { name: true } } },
    take: 40,
  });
  // Due fornitori diversi: i subtotali si vedono solo se ce n'è più d'uno.
  const primo = offerte[0]!;
  const secondo = offerte.find((o) => o.supplierId !== primo.supplierId) ?? offerte[1]!;

  console.log('\n── Criterio 1: subtotali e totale generale, IVA inclusa ─────────\n');

  await ordini.aggiungiRiga(utente.id, { supplierProductId: primo.id, quantityPacks: 3 });
  await ordini.aggiungiRiga(utente.id, { supplierProductId: secondo.id, quantityPacks: 2 });
  const riepilogo = await ordini.riepilogo(utente.id);
  const o = riepilogo.ordine;

  const sommaGruppi = o.perFornitore.reduce((a, g) => a.plus(g.netto), new Decimal(0));
  esito(
    sommaGruppi.equals(new Decimal(o.totali.netto)),
    `i subtotali per fornitore sommano al netto: ${sommaGruppi} = ${o.totali.netto}`,
  );
  const sommaRighe = o.righe.reduce((a, r) => a.plus(r.lineTotalNet), new Decimal(0));
  esito(sommaRighe.equals(new Decimal(o.totali.netto)), 'e le righe pure');
  esito(
    new Decimal(o.totali.lordo).equals(new Decimal(o.totali.netto).plus(o.totali.iva)),
    `il lordo è netto + IVA: ${o.totali.netto} + ${o.totali.iva} = ${o.totali.lordo}`,
  );
  console.log(
    `     segnalazioni: ${riepilogo.minimiNonRaggiunti.length} minimi, ${riepilogo.prezziCambiati.length} prezzi cambiati, ${riepilogo.prezziFermi.length} fermi, ${riepilogo.senzaConfronto.length} senza confronto`,
  );

  let versionePrezziRifiutata = false;
  try {
    await ordini.conferma(utente.id, {
      orderId: o.id,
      updatedAt: o.updatedAt,
      priceVersion: '0'.repeat(64),
      note: o.note,
    });
  } catch (errore) {
    versionePrezziRifiutata = errore instanceof OrderVersionError;
  }
  esito(
    versionePrezziRifiutata,
    'una fotografia prezzi diversa da quella del riepilogo blocca la conferma',
  );

  console.log('\n── Criterio 2: gli snapshot si leggono senza il catalogo ────────\n');

  const confermato = await ordini.conferma(utente.id, {
    orderId: o.id,
    updatedAt: o.updatedAt,
    priceVersion: riepilogo.priceVersion,
    note: o.note,
  });
  esito(confermato.code.length > 0, `l'ordine ha il codice ${confermato.code}`);
  esito(!confermato.giaConfermato, 'ed è stato confermato adesso');

  // Si cancella tutto ciò che l'ordine referenziava: nomi, prezzi, offerte.
  // Se il dettaglio sopravvive, il congelamento ha funzionato davvero.
  await systemPrisma.supplierProduct.updateMany({
    where: { id: { in: [primo.id, secondo.id] } },
    data: { rawName: 'NOME CANCELLATO', active: false },
  });
  await systemPrisma.supplier.updateMany({
    where: { id: { in: [primo.supplierId, secondo.supplierId] } },
    data: { name: 'FORNITORE RINOMINATO' },
  });

  const congelato = await systemPrisma.order.findUniqueOrThrow({
    where: { id: confermato.orderId },
    select: {
      code: true,
      status: true,
      totalNet: true,
      lines: {
        select: {
          nameSnapshot: true,
          supplierNameSnapshot: true,
          unitPriceNetSnapshot: true,
          lineTotalNet: true,
          quantityPacks: true,
        },
      },
    },
  });
  esito(
    congelato.lines.every((l) => l.nameSnapshot !== 'NOME CANCELLATO'),
    'i nomi dei prodotti sono quelli di allora, non quelli cancellati',
  );
  esito(
    congelato.lines.every((l) => l.supplierNameSnapshot !== 'FORNITORE RINOMINATO'),
    `i fornitori pure (${[...new Set(congelato.lines.map((l) => l.supplierNameSnapshot))].join(', ')})`,
  );
  esito(
    congelato.lines
      .reduce((a, l) => a.plus(l.lineTotalNet.toString()), new Decimal(0))
      .equals(new Decimal(congelato.totalNet.toString())),
    `i totali tornano dagli snapshot: ${congelato.totalNet} €`,
  );
  esito(congelato.status === 'CONFIRMED', 'lo stato è CONFIRMED');

  console.log('\n── Criterio 3: il doppio invio non crea due ordini ──────────────\n');

  await systemPrisma.orderLine.deleteMany({});
  await systemPrisma.order.deleteMany({ where: { status: 'DRAFT' } });
  const buone = await systemPrisma.supplierProduct.findMany({
    where: { organizationId: org.id, active: true, currentPriceId: { not: null } },
    select: { id: true },
    take: 2,
  });
  await ordini.aggiungiRiga(utente.id, { supplierProductId: buone[0]!.id, quantityPacks: 1 });
  const riepilogoDaConfermare = await ordini.riepilogo(utente.id);
  const daConfermare = riepilogoDaConfermare.ordine;
  const richiestaConferma = {
    orderId: daConfermare.id,
    updatedAt: daConfermare.updatedAt,
    priceVersion: riepilogoDaConfermare.priceVersion,
    note: daConfermare.note,
  };

  const quanti = await systemPrisma.order.count();
  // Cinque conferme insieme: è il doppio clic, o il tasto premuto due volte
  // mentre la rete è lenta.
  const raffica = await Promise.all(
    Array.from({ length: 5 }, () =>
      ordini.conferma(utente.id, richiestaConferma).catch((e: Error) => e.message),
    ),
  );
  const fallite = raffica.filter((r): r is string => typeof r === 'string');
  // Nessuna deve fallire: un errore dopo che l'ordine È stato confermato fa
  // pensare che non sia andata, e la reazione naturale è premere ancora.
  esito(
    fallite.length === 0,
    `nessuna delle cinque conferme fallisce (${fallite.length}${fallite[0] ? `: ${fallite[0].slice(0, 60)}` : ''})`,
  );
  const codici = new Set(
    raffica
      .filter((r): r is Awaited<ReturnType<typeof ordini.conferma>> => typeof r !== 'string')
      .map((r) => r.code),
  );
  esito(
    codici.size === 1,
    `cinque conferme simultanee danno un codice solo (${[...codici].join(', ')})`,
  );
  esito((await systemPrisma.order.count()) === quanti, 'e nessun ordine in più nel database');
  esito(
    raffica.filter((r) => typeof r !== 'string' && r.giaConfermato).length >= 1,
    'le successive dicono «già confermato» invece di dare errore',
  );
  const retryDopoLaRisposta = await ordini.conferma(utente.id, richiestaConferma);
  esito(
    retryDopoLaRisposta.giaConfermato && retryDopoLaRisposta.code === [...codici][0],
    'anche un retry sequenziale restituisce lo stesso ordine, senza creare una bozza vuota',
  );

  console.log('\n── Criterio 4: il codice è progressivo, senza buchi ─────────────\n');

  // Si confermano altri tre ordini e si guardano i numeri di fila.
  for (let i = 0; i < 3; i++) {
    await systemPrisma.order.deleteMany({ where: { status: 'DRAFT' } });
    await ordini.aggiungiRiga(utente.id, { supplierProductId: buone[0]!.id, quantityPacks: 1 });
    const riepilogoCorrente = await ordini.riepilogo(utente.id);
    const corrente = riepilogoCorrente.ordine;
    await ordini.conferma(utente.id, {
      orderId: corrente.id,
      updatedAt: corrente.updatedAt,
      priceVersion: riepilogoCorrente.priceVersion,
      note: corrente.note,
    });
  }

  const tutti = await systemPrisma.order.findMany({
    where: { code: { not: null } },
    select: { code: true },
    orderBy: { code: 'asc' },
  });
  const numeri = tutti.map((t) => Number(t.code!.split('-')[1]));
  console.log(`     codici: ${tutti.map((t) => t.code).join(', ')}`);
  esito(new Set(numeri).size === numeri.length, 'nessun duplicato');
  esito(
    numeri.every((n, i) => i === 0 || n === numeri[i - 1]! + 1),
    'nessun buco: si susseguono uno a uno',
  );
  esito(numeri[0] === 1, 'il primo dell’anno è 0001');

  await systemPrisma.orderLine.deleteMany({});
  await systemPrisma.order.deleteMany({});
  await systemPrisma.$disconnect();
  console.log('');
}

main().catch(async (errore: unknown) => {
  console.error(errore);
  await systemPrisma.$disconnect();
  process.exit(1);
});
