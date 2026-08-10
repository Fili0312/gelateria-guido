import { Decimal } from 'decimal.js';
import { systemPrisma } from '../src/server/database/system-client.js';
import { ordersRepository } from '../src/server/repositories/orders.js';

/**
 * I quattro criteri della Fase 13, su una copia.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo \
 *     tsx --conditions=react-server scripts/collaudo-avviso.ts
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === '/gelateria_guido') {
  throw new Error('Questo script crea e cancella ordini: puntalo su una copia.');
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

  // Un prodotto con due offerte confrontabili e prezzi diversi: è il caso in
  // cui l'avviso deve comparire.
  const conDue = await systemPrisma.product.findFirstOrThrow({
    where: {
      organizationId: org.id,
      bestOffer: { comparable: true },
      supplierProducts: { some: { packQuantityConfirmed: true } },
    },
    select: {
      name: true,
      supplierProducts: {
        where: { active: true, currentPriceId: { not: null }, packQuantityConfirmed: true },
        select: {
          id: true,
          packQuantity: true,
          contentPerPack: true,
          supplier: { select: { name: true } },
          currentPrice: { select: { priceNet: true, unitPrice: true } },
        },
      },
    },
  });

  const ordinate = [...conDue.supplierProducts].sort(
    (a, b) =>
      Number(b.currentPrice!.unitPrice.toString()) - Number(a.currentPrice!.unitPrice.toString()),
  );
  const piuCara = ordinate[0]!;
  const migliore = ordinate.at(-1)!;

  console.log(`\n── Criterio 1: l'avviso compare quando serve ────────────────────\n`);
  console.log(`  Prodotto: ${conDue.name}`);
  console.log(
    `  ${piuCara.supplier.name} ${piuCara.currentPrice!.priceNet} € · ${migliore.supplier.name} ${migliore.currentPrice!.priceNet} €\n`,
  );

  // Si aggiunge **la più cara**: è la situazione in cui l'avviso deve parlare.
  const conAvviso = await ordini.aggiungiRiga(utente.id, {
    supplierProductId: piuCara.id,
    quantityPacks: 4,
  });
  const riga = conAvviso.righe[0]!;
  esito(riga.avviso !== null, 'la riga ha un avviso');
  esito(
    riga.avviso?.migliore.supplierProductId === migliore.id,
    `indica il fornitore giusto (${riga.avviso?.migliore.supplierName})`,
  );
  esito(
    Number(riga.avviso?.risparmioPerConfezione ?? 0) > 0,
    `dice quanto si risparmia a confezione (${riga.avviso?.risparmioPerConfezione} €)`,
  );
  esito(
    new Decimal(riga.avviso?.risparmioTotale ?? 0).equals(
      new Decimal(riga.avviso?.risparmioPerConfezione ?? 0).mul(4),
    ),
    `e sul totale della riga (${riga.avviso?.risparmioTotale} € su 4 confezioni)`,
  );
  esito(
    conAvviso.totali.righeConAvviso >= (riga.avviso?.meritaAvviso ? 1 : 0),
    `il riepilogo dell'ordine conta gli avvisi (${conAvviso.totali.righeConAvviso}, risparmio ${conAvviso.totali.risparmioPotenziale} €)`,
  );

  console.log(`\n── Criterio 2: sotto soglia non compare niente ──────────────────\n`);

  // Si alzano le soglie oltre il risparmio possibile: l'avviso deve tacere.
  const scriviSoglia = async (key: string, value: number) => {
    const cambiate = await systemPrisma.setting.updateMany({
      where: { organizationId: org.id, key },
      data: { value },
    });
    if (cambiate.count === 0) {
      await systemPrisma.setting.create({ data: { organizationId: org.id, key, value } });
    }
  };
  await scriviSoglia('avviso.sogliaPercentuale', 99);
  await scriviSoglia('avviso.sogliaEuro', 9999);
  const conSoglieAlte = await ordini.corrente(utente.id);
  const rigaAlta = conSoglieAlte.righe[0]!;
  esito(rigaAlta.avviso !== null, 'il confronto si calcola comunque');
  esito(rigaAlta.avviso?.meritaAvviso === false, 'ma non merita un avviso: sotto soglia');
  esito(
    conSoglieAlte.totali.righeConAvviso === 0 && conSoglieAlte.totali.risparmioPotenziale === '0',
    'e il riepilogo non promette risparmi che non segnala',
  );

  // Si rimettono le soglie di prima.
  await scriviSoglia('avviso.sogliaPercentuale', 3);
  await scriviSoglia('avviso.sogliaEuro', 0.3);

  console.log(`\n── Criterio 3: lo scambio mantiene i pezzi e lo dichiara ────────\n`);

  const prima = await ordini.corrente(utente.id);
  const rigaPrima = prima.righe[0]!;
  const avviso = rigaPrima.avviso!;
  console.log(`  ${avviso.cambio.descrizione}`);
  console.log(`  spesa ${avviso.cambio.spesaPrima} € → ${avviso.cambio.spesaDopo} €\n`);

  esito(avviso.cambio.descrizione.includes('pz'), 'il conto dei pezzi è scritto prima di premere');
  esito(
    avviso.cambio.esatto
      ? avviso.cambio.pezziPrima === avviso.cambio.pezziDopo
      : /non è la stessa quantità/.test(avviso.cambio.descrizione),
    avviso.cambio.esatto
      ? `i pezzi totali coincidono (${avviso.cambio.pezziPrima})`
      : 'quando non coincidono lo dichiara invece di arrotondare in silenzio',
  );

  const dopo = await ordini.cambiaFornitore(
    utente.id,
    rigaPrima.id,
    avviso.migliore.supplierProductId,
  );
  const rigaDopo = dopo.righe[0]!;
  esito(
    rigaDopo.supplierProductId === avviso.migliore.supplierProductId,
    `la riga è passata a ${rigaDopo.supplierName}`,
  );
  esito(
    rigaDopo.quantityPacks === avviso.cambio.confezioni,
    `con le confezioni ricalcolate (${rigaDopo.quantityPacks}, non ${rigaPrima.quantityPacks})`,
  );
  esito(
    rigaDopo.quantityPacks * rigaDopo.packQuantity === avviso.cambio.pezziDopo,
    `e i pezzi sono quelli annunciati (${rigaDopo.quantityPacks * rigaDopo.packQuantity})`,
  );
  esito(dopo.righe.length === 1, 'resta una riga sola: non se ne aggiunge una nuova');
  esito(
    new Decimal(dopo.totali.netto).equals(new Decimal(avviso.cambio.spesaDopo)),
    `e il totale è quello annunciato (${dopo.totali.netto} €)`,
  );

  console.log(`\n── Criterio 4: si può ignorare e andare avanti ──────────────────\n`);

  // Si torna al fornitore più caro per avere di nuovo un avviso da zittire.
  const tornato = await ordini.cambiaFornitore(utente.id, rigaDopo.id, piuCara.id);
  const daZittire = tornato.righe[0]!;
  esito(daZittire.avviso?.meritaAvviso === true, 'l’avviso è tornato');

  const zittito = await ordini.aggiornaRiga(utente.id, daZittire.id, { ignoraAvviso: true });
  const rigaZittita = zittito.righe[0]!;
  esito(rigaZittita.avvisoIgnorato, 'si può dire «non avvisarmi più»');
  esito(
    rigaZittita.avviso !== null,
    'il confronto resta calcolato: non si perde, si smette solo di gridarlo',
  );
  esito(
    zittito.totali.righeConAvviso === 0,
    'e non conta più nel risparmio potenziale dell’ordine',
  );
  esito(
    rigaZittita.supplierProductId === piuCara.id,
    `l’ordine resta col fornitore più caro, che era la scelta di chi ordina`,
  );

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
