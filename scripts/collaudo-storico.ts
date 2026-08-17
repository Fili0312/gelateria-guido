import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Decimal } from 'decimal.js';
import { systemPrisma } from '../src/server/database/system-client.js';
import { orderDocumentsRepository } from '../src/server/repositories/order-documents.js';
import { ordersRepository } from '../src/server/repositories/orders.js';

/**
 * I tre criteri della Fase 15, su una copia.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo \
 *     tsx --conditions=react-server scripts/collaudo-storico.ts
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === '/gelateria_guido') {
  throw new Error('Questo script conferma e annulla ordini: puntalo su una copia.');
}

function esito(ok: boolean, testo: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const utente = await systemPrisma.user.findFirstOrThrow({ select: { id: true } });
  const ordini = ordersRepository(org.id);
  const confermaCorrente = async () => {
    const riepilogo = await ordini.riepilogo(utente.id);
    const corrente = riepilogo.ordine;
    return ordini.conferma(utente.id, {
      orderId: corrente.id,
      updatedAt: corrente.updatedAt,
      priceVersion: riepilogo.priceVersion,
      note: corrente.note,
    });
  };

  await systemPrisma.orderLine.deleteMany({});
  await systemPrisma.order.deleteMany({});

  const offerte = await systemPrisma.supplierProduct.findMany({
    where: { organizationId: org.id, active: true, currentPriceId: { not: null } },
    select: { id: true, supplierId: true, currentPrice: { select: { id: true, priceNet: true } } },
    take: 40,
  });
  const a = offerte[0]!;
  const b = offerte.find((o) => o.supplierId !== a.supplierId) ?? offerte[1]!;
  const c = offerte.find((o) => o.id !== a.id && o.id !== b.id)!;

  console.log('\n── Criterio 1: un ordine vecchio mostra i prezzi di allora ──────\n');

  await ordini.aggiungiRiga(utente.id, { supplierProductId: a.id, quantityPacks: 2 });
  await ordini.aggiungiRiga(utente.id, { supplierProductId: b.id, quantityPacks: 1 });
  await ordini.aggiungiRiga(utente.id, { supplierProductId: c.id, quantityPacks: 3 });
  const confermato = await confermaCorrente();
  const prima = (await ordini.storico(confermato.orderId))!;
  const nettoAllora = prima.netto;
  console.log(`     ordine ${prima.code}: ${nettoAllora} €`);

  // Passano sei mesi: i prezzi raddoppiano, un prodotto viene rinominato, un
  // fornitore cambia nome, un'offerta sparisce dal listino.
  for (const o of [a, b, c]) {
    await systemPrisma.supplierProductPrice.update({
      where: { id: o.currentPrice!.id },
      data: { priceNet: new Decimal(o.currentPrice!.priceNet.toString()).mul(2).toString() },
    });
  }
  await systemPrisma.supplierProduct.updateMany({
    where: { id: { in: [a.id, b.id, c.id] } },
    data: { rawName: 'RINOMINATO DOPO' },
  });
  // Uno per uno: il nome del fornitore è unico per organizzazione, e da
  // quando i fornitori sono nove `a` e `b` non sono più lo stesso.
  for (const [indice, supplierId] of [...new Set([a.supplierId, b.supplierId])].entries()) {
    await systemPrisma.supplier.update({
      where: { id: supplierId },
      data: { name: `FORNITORE CAMBIATO ${indice + 1}` },
    });
  }
  await systemPrisma.supplierProduct.update({ where: { id: c.id }, data: { active: false } });

  const dopo = (await ordini.storico(confermato.orderId))!;
  esito(dopo.netto === nettoAllora, `il totale è ancora quello di allora: ${dopo.netto} €`);
  esito(
    dopo.perFornitore.every((g) => g.supplierName !== 'FORNITORE CAMBIATO'),
    `i fornitori sono quelli di allora (${dopo.perFornitore.map((g) => g.supplierName).join(', ')})`,
  );
  esito(
    dopo.perFornitore.every((g) => g.righe.every((r) => r.name !== 'RINOMINATO DOPO')),
    'i nomi dei prodotti pure',
  );
  esito(
    dopo.perFornitore
      .flatMap((g) => g.righe)
      .every((r) =>
        new Decimal(r.lineTotalNet).equals(
          new Decimal(r.priceNet).mul(r.quantityPacks).toDecimalPlaces(2),
        ),
      ),
    'e ogni riga torna col prezzo fotografato',
  );

  console.log('\n── Criterio 2: riordina, ai prezzi di oggi e dicendo cosa cambia ─\n');

  const riordino = await ordini.riordina(utente.id, confermato.orderId);
  console.log(
    `     ${riordino.copiate} copiate · ${riordino.cambiate.length} cambiate · ${riordino.saltate.length} saltate`,
  );
  esito(riordino.copiate === 2, `copia solo quelle ancora ordinabili (${riordino.copiate} su 3)`);
  esito(
    riordino.saltate.length === 1 && /non lo tiene più a listino/.test(riordino.saltate[0]!.motivo),
    `e dice perché ha saltato l'altra: «${riordino.saltate[0]?.motivo}»`,
  );
  esito(riordino.cambiate.length === 2, `segnala i prezzi cambiati (${riordino.cambiate.length})`);
  esito(
    riordino.cambiate.every((x) =>
      new Decimal(x.prezzoAdesso).equals(new Decimal(x.prezzoAllora).mul(2)),
    ),
    'col prima e il dopo giusti (raddoppiati)',
  );

  const bozza = await ordini.corrente(utente.id);
  esito(
    bozza.righe.every((r) => {
      const nuovo = offerte.find((o) => o.id === r.supplierProductId)!;
      return new Decimal(r.priceNet).equals(
        new Decimal(nuovo.currentPrice!.priceNet.toString()).mul(2),
      );
    }),
    `la bozza usa i prezzi di ADESSO, non quelli di allora (${bozza.totali.netto} €)`,
  );

  console.log('\n── Criterio 3: i filtri e la paginazione ───────────────────────\n');

  // Un po' di ordini, per avere qualcosa da filtrare e paginare.
  for (let i = 0; i < 6; i++) {
    await ordini.svuota(utente.id);
    await ordini.aggiungiRiga(utente.id, { supplierProductId: a.id, quantityPacks: 1 });
    await confermaCorrente();
  }

  const tutti = await ordini.elenco({
    q: '',
    stato: 'tutti',
    supplierId: '',
    giorni: 0,
    pagina: 1,
    perPagina: 20,
  });
  esito(tutti.totale === 7, `${tutti.totale} ordini in tutto`);

  const paginati = await ordini.elenco({
    q: '',
    stato: 'tutti',
    supplierId: '',
    giorni: 0,
    pagina: 2,
    perPagina: 3,
  });
  esito(
    paginati.items.length === 3,
    `la seconda pagina da tre ne ha tre (${paginati.items.length})`,
  );
  esito(paginati.totale === 7, 'e il totale resta quello vero');

  // Il filtro si prova con **due** fornitori: uno che negli ordini c'è e uno
  // che non c'è. Provarlo solo col primo non distingue un filtro che funziona
  // da uno che non filtra affatto.
  const dentro = await ordini.elenco({
    q: '',
    stato: 'tutti',
    supplierId: a.supplierId,
    giorni: 0,
    pagina: 1,
    perPagina: 20,
  });
  esito(
    dentro.totale === 7,
    `filtrando per il fornitore degli ordini escono i suoi 7 (${dentro.totale})`,
  );

  const estraneo = await systemPrisma.supplier.findFirst({
    where: { organizationId: org.id, id: { not: a.supplierId } },
    select: { id: true, name: true },
  });
  if (estraneo) {
    const fuori = await ordini.elenco({
      q: '',
      stato: 'tutti',
      supplierId: estraneo.id,
      giorni: 0,
      pagina: 1,
      perPagina: 20,
    });
    esito(
      fuori.totale === 0,
      `e per un fornitore che non c'è (${estraneo.name}) non esce niente (${fuori.totale})`,
    );
  }

  const nomeCercato = prima.perFornitore[0]!.righe[0]!.name.split(' ')[0]!;
  const perProdotto = await ordini.elenco({
    q: nomeCercato,
    stato: 'tutti',
    supplierId: '',
    giorni: 0,
    pagina: 1,
    perPagina: 20,
  });
  esito(
    perProdotto.totale > 0,
    `la ricerca per prodotto («${nomeCercato}») trova ${perProdotto.totale} ordini`,
  );
  const inesistente = await ordini.elenco({
    q: 'zzz-non-esiste',
    stato: 'tutti',
    supplierId: '',
    giorni: 0,
    pagina: 1,
    perPagina: 20,
  });
  esito(inesistente.totale === 0, "e un prodotto che non c'è non ne trova nessuno");

  const recenti = await ordini.elenco({
    q: '',
    stato: 'tutti',
    supplierId: '',
    giorni: 30,
    pagina: 1,
    perPagina: 20,
  });
  esito(recenti.totale === 7, 'il filtro per periodo li prende tutti (sono di oggi)');

  console.log('\n── Annullare, senza cancellare ─────────────────────────────────\n');

  const annullato = await ordini.annulla(utente.id, confermato.orderId);
  esito(annullato.status === 'CANCELLED', 'lo stato diventa CANCELLED');
  esito(annullato.code === prima.code, `il numero resta ${annullato.code}: non lascia un buco`);
  const dueVolte = await ordini.annulla(utente.id, confermato.orderId);
  esito(dueVolte.cancelledAt === annullato.cancelledAt, 'annullarlo due volte non cambia la data');
  const soloAnnullati = await ordini.elenco({
    q: '',
    stato: 'CANCELLED',
    supplierId: '',
    giorni: 0,
    pagina: 1,
    perPagina: 20,
  });
  esito(soloAnnullati.totale === 1, 'e si ritrova filtrando per «annullati»');

  // ── «Mi sono sbagliato»: eliminare per davvero ──────────────────────
  //
  // Annullare lascia l'ordine nello storico col suo numero, ed è giusto per
  // un ordine vero che non si fa più. Un ordine confermato per sbaglio
  // trenta secondi fa invece non è mai esistito, e va via — documenti
  // compresi, o resterebbero PDF che il database non conosce più.
  console.log('\n── «Mi sono sbagliato»: l’ordine sparisce davvero ───────────────\n');

  const daEliminare = await systemPrisma.order.findFirst({
    where: { status: { not: 'DRAFT' } },
    select: { id: true, code: true },
  });
  if (!daEliminare) {
    console.log('  ~ nessun ordine confermato da eliminare');
  } else {
    const documenti = await orderDocumentsRepository(org.id).genera(utente.id, daEliminare.id);
    const percorsi = (
      await systemPrisma.orderDocument.findMany({
        where: { orderId: daEliminare.id },
        select: { filePath: true },
      })
    ).map((d) => d.filePath);
    const radice = process.env.STORAGE_DIR ?? join(process.cwd(), 'storage');
    const esistevano = percorsi.filter((f) => existsSync(join(radice, f))).length;

    const esito2 = await ordini.elimina(daEliminare.id);
    esito(esito2.code === daEliminare.code, `eliminato l'ordine ${esito2.code}`);
    esito(
      (await systemPrisma.order.count({ where: { id: daEliminare.id } })) === 0,
      'sparito dallo storico',
    );
    esito(
      (await systemPrisma.orderLine.count({ where: { orderId: daEliminare.id } })) === 0,
      'con le sue righe',
    );
    esito(
      (await systemPrisma.orderDocument.count({ where: { orderId: daEliminare.id } })) === 0,
      `e i suoi ${documenti.length} documenti`,
    );
    esito(
      esistevano > 0 && percorsi.every((f) => !existsSync(join(radice, f))),
      `i ${esistevano} file sono spariti anche dal disco, non solo dal database`,
    );
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
