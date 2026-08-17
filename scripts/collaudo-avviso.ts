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

  // Un prodotto con due offerte confrontabili e **prezzi diversi**: è il caso
  // in cui l'avviso deve comparire.
  //
  // La differenza va cercata, non sperata: prendendo il primo prodotto con due
  // fornitori si finiva su un'acqua che entrambi vendono a 3,90 €, dove
  // l'avviso giustamente non c'è — e il collaudo lo leggeva come un difetto.
  const candidati = await systemPrisma.product.findMany({
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
          supplier: { select: { name: true, extraDiscountPct: true } },
          currentPrice: { select: { priceNet: true, unitPrice: true } },
        },
      },
    },
    take: 500,
  });

  const unitarioEffettivo = (o: (typeof candidati)[number]['supplierProducts'][number]) =>
    new Decimal(o.currentPrice!.unitPrice.toString())
      .mul(new Decimal(100).minus(o.supplier.extraDiscountPct?.toString() ?? '0'))
      .div(100);

  // Serve uno scarto che superi le soglie, o l'avviso non merita di comparire
  // e il criterio proverebbe il contrario di quello che dice.
  const conDue = candidati.find((p) => {
    const offerte = p.supplierProducts;
    if (offerte.length < 2) return false;
    const valori = offerte.map(unitarioEffettivo);
    const min = Decimal.min(...valori);
    const max = Decimal.max(...valori);
    return min.gt(0) && max.minus(min).div(max).mul(100).gt(10);
  });
  if (!conDue) throw new Error('Nessun prodotto con due offerte e prezzi abbastanza diversi.');

  // Ordinate sull'**effettivo**: è il numero su cui l'app decide chi è
  // migliore, e il collaudo deve guardare lo stesso.
  const ordinate = [...conDue.supplierProducts].sort((a, b) =>
    unitarioEffettivo(b).comparedTo(unitarioEffettivo(a)),
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

  // ── Lo sconto concordato conta anche nell'avviso ────────────────────
  //
  // È il difetto che ha fatto sbagliare un ordine vero: l'elenco ordinava
  // sull'effettivo e segnava «migliore» un fornitore, il riepilogo
  // confrontava i listini e consigliava di passare all'altro «per
  // risparmiare». Seguirlo faceva spendere di più.
  //
  // Il collaudo lo prova qui e non fra i test perché il difetto non stava
  // nella regola — quella era giusta — ma nel numero che le si passava.
  console.log('\n── Lo sconto concordato conta anche nell’avviso ─────────────────\n');

  const conSconto = await systemPrisma.supplier.findFirst({
    where: { organizationId: org.id, extraDiscountPct: { gt: 0 } },
    select: { id: true, name: true, extraDiscountPct: true },
  });

  if (!conSconto) {
    console.log('  ~ nessun fornitore ha uno sconto concordato: criterio non verificabile');
  } else {
    // Un prodotto in cui quel fornitore è più caro a listino ma più
    // conveniente col rimborso: è esattamente il caso che si sbagliava.
    const candidati = await systemPrisma.product.findMany({
      where: {
        supplierProducts: {
          some: { supplierId: conSconto.id, active: true, currentPriceId: { not: null } },
        },
      },
      select: {
        id: true,
        name: true,
        supplierProducts: {
          where: { active: true, currentPriceId: { not: null } },
          select: {
            id: true,
            supplierId: true,
            supplier: { select: { name: true, extraDiscountPct: true } },
            currentPrice: { select: { priceNet: true } },
          },
        },
      },
      take: 400,
    });

    const effettivo = (o: (typeof candidati)[number]['supplierProducts'][number]) =>
      new Decimal(o.currentPrice!.priceNet.toString())
        .mul(new Decimal(100).minus(o.supplier.extraDiscountPct?.toString() ?? '0'))
        .div(100);

    const caso = candidati.find((p) => {
      if (p.supplierProducts.length < 2) return false;
      const suo = p.supplierProducts.find((o) => o.supplierId === conSconto.id);
      const altro = p.supplierProducts.find((o) => o.supplierId !== conSconto.id);
      if (!suo || !altro) return false;
      const listinoSuo = new Decimal(suo.currentPrice!.priceNet.toString());
      const listinoAltro = new Decimal(altro.currentPrice!.priceNet.toString());
      // Più caro a listino, più conveniente col rimborso: il ribaltamento.
      return listinoSuo.gt(listinoAltro) && effettivo(suo).lt(effettivo(altro));
    });

    if (!caso) {
      console.log('  ~ nessun prodotto in cui lo sconto ribalta la scelta: non verificabile');
    } else {
      const suo = caso.supplierProducts.find((o) => o.supplierId === conSconto.id)!;
      const altro = caso.supplierProducts.find((o) => o.supplierId !== conSconto.id)!;
      console.log(`     ${caso.name}`);
      console.log(
        `       ${suo.supplier.name}: ${suo.currentPrice!.priceNet} € a listino → ${effettivo(suo).toFixed(4)} € col rimborso`,
      );
      console.log(
        `       ${altro.supplier.name}: ${altro.currentPrice!.priceNet} € a listino → ${effettivo(altro).toFixed(4)} €`,
      );

      await systemPrisma.orderLine.deleteMany({});
      await ordini.aggiungiRiga(utente.id, { supplierProductId: suo.id, quantityPacks: 1 });
      const corrente = await ordini.corrente(utente.id);
      const rigaScelta = corrente.righe[0]!;

      esito(
        rigaScelta.avviso?.meritaAvviso !== true,
        `scelto ${suo.supplier.name}, il riepilogo non consiglia di cambiare` +
          (rigaScelta.avviso?.meritaAvviso
            ? ` (invece dice: prendilo da ${rigaScelta.avviso.migliore.supplierName})`
            : ''),
      );
    }
  }

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
