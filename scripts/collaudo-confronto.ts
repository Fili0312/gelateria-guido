import { execFileSync } from 'node:child_process';
import { systemPrisma } from '../src/server/database/system-client.js';
import { ricalcolaMiglioriOfferte } from '../src/server/import/best-offer.js';
import { comparisonRepository } from '../src/server/repositories/comparison.js';

/**
 * I quattro criteri della Fase 11, su una copia del database di produzione.
 *
 * Il criterio che non si può verificare a occhio è l'ultimo — «il ricalcolo su
 * tutto il catalogo resta sotto qualche secondo» — perché su un catalogo di
 * centoquaranta prodotti qualunque implementazione sembra veloce. Qui il
 * catalogo si moltiplica finché il numero non diventa significativo.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo \
 *     tsx --conditions=react-server scripts/collaudo-confronto.ts
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === '/gelateria_guido') {
  throw new Error('Questo script scrive e moltiplica il catalogo: puntalo su una copia.');
}

function esito(ok: boolean, testo: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) process.exitCode = 1;
}

/** `psql` non accetta il `?schema=public` che Prisma mette nell'URL. */
const urlPsql = url.split('?')[0]!;

function sql(query: string): string {
  return execFileSync('psql', [urlPsql, '-Atc', query], { encoding: 'utf8' }).trim();
}

async function main() {
  const organizationId = (await systemPrisma.organization.findFirstOrThrow({ select: { id: true } }))
    .id;
  const confronti = comparisonRepository(organizationId);

  console.log('\n── Criterio 1: tre offerte a confezioni diverse ─────────────────\n');

  /**
   * Il caso 12/24 della roadmap, costruito sui dati veri: si prende un prodotto
   * esistente e gli si collegano tre offerte dello stesso articolo in colli
   * diversi. Il netto più basso deve **perdere**.
   */
  // Un prodotto **nuovo** e non uno esistente: agganciare i tre colli a un
  // prodotto che ha già offerte misurerebbe quelle, non il caso 12/24. È
  // successo al primo giro, e il collaudo ha giustamente segnalato rosso.
  const prodotto = await systemPrisma.product.create({
    data: {
      organizationId,
      name: 'COLLAUDO acqua 50 cl',
      normalizedName: 'collaudo acqua',
      unitSize: '50',
      unitOfMeasure: 'CL',
      baseUnit: 'L',
      createdBy: 'USER',
    },
    select: { id: true, name: true },
  });
  const fornitori = await systemPrisma.supplier.findMany({
    where: { organizationId },
    select: { id: true },
    take: 2,
  });

  const COLLI = [
    { etichetta: 'collo-12', pezzi: 12, contenuto: '6', netto: '9.00' },
    { etichetta: 'collo-24', pezzi: 24, contenuto: '12', netto: '16.00' },
    { etichetta: 'collo-6', pezzi: 6, contenuto: '3', netto: '4.20' },
  ];

  const creati: string[] = [];
  for (const [indice, collo] of COLLI.entries()) {
    const offerta = await systemPrisma.supplierProduct.create({
      data: {
        organizationId,
        supplierId: fornitori[indice % fornitori.length]!.id,
        supplierCode: `COLLAUDO-${collo.etichetta}`,
        rawName: `COLLAUDO ${collo.etichetta}`,
        normalizedName: `collaudo ${collo.etichetta}`,
        fingerprint: `collaudo-${collo.etichetta}-${Date.now()}`,
        packQuantity: collo.pezzi,
        packQuantityConfirmed: true,
        unitSize: '50',
        unitOfMeasure: 'CL',
        contentPerPack: collo.contenuto,
        baseUnit: 'L',
        productId: prodotto.id,
        matchStatus: 'CONFIRMED',
      },
      select: { id: true },
    });
    const prezzo = await systemPrisma.supplierProductPrice.create({
      data: {
        supplierProductId: offerta.id,
        priceList: collo.netto,
        priceNet: collo.netto,
        unitPrice: (Number(collo.netto) / Number(collo.contenuto)).toFixed(6),
        unitPriceBasis: 'PER_L',
        validFrom: new Date(),
      },
      select: { id: true },
    });
    await systemPrisma.supplierProduct.update({
      where: { id: offerta.id },
      data: { currentPriceId: prezzo.id },
    });
    creati.push(offerta.id);
  }

  const conTre = await confronti.perProdotto(prodotto.id);
  const migliore = conTre?.best;
  esito(conTre?.state === 'CONFRONTATO', `il prodotto «${prodotto.name}» ha un confronto`);
  esito(
    migliore?.supplierCode === 'COLLAUDO-collo-24',
    `vince il collo da 24 (netto 16,00 €) e non il collo da 6 (netto 4,20 €) — vincitore: ${migliore?.supplierCode}`,
  );
  esito(
    conTre?.savingPerPack === '2',
    `il risparmio su una confezione è 2,00 € — calcolato: ${conTre?.savingPerPack}`,
  );
  esito(
    conTre!.ranked.length >= 3,
    `la classifica contiene tutte e tre le offerte (${conTre!.ranked.length})`,
  );

  console.log('\n── Criterio 2: ordinamento per impatto e filtri ─────────────────\n');

  const perEuro = await confronti.report({ sort: 'saving-desc' });
  const ordinato = perEuro.comparisons.every(
    (r, i, tutti) => i === 0 || Number(tutti[i - 1]!.savingPerPack) >= Number(r.savingPerPack),
  );
  esito(ordinato, `i ${perEuro.comparisons.length} confronti sono in ordine di risparmio decrescente`);

  const perPercentuale = await confronti.report({ sort: 'saving-pct-desc' });
  esito(
    perPercentuale.comparisons.every(
      (r, i, tutti) => i === 0 || Number(tutti[i - 1]!.savingPct) >= Number(r.savingPct),
    ),
    'l’ordinamento per percentuale è un ordine diverso e coerente',
  );

  const soloAvvisi = await confronti.report({ onlyAlert: true });
  esito(
    soloAvvisi.comparisons.every((r) => r.worthAlert),
    `il filtro «vale il cambio» lascia solo quelli oltre soglia (${soloAvvisi.comparisons.length})`,
  );

  const fornitoreVincente = perEuro.comparisons[0]?.best?.supplierId;
  if (fornitoreVincente) {
    const perFornitore = await confronti.report({ bestSupplierId: fornitoreVincente });
    esito(
      perFornitore.comparisons.every((r) => r.best?.supplierId === fornitoreVincente),
      `il filtro per fornitore restituisce solo i suoi (${perFornitore.comparisons.length})`,
    );
  }

  console.log('\n── Criterio 3: i non confrontabili stanno a parte ───────────────\n');

  esito(
    perEuro.comparisons.every((r) => r.state === 'CONFRONTATO'),
    'l’elenco dei confronti contiene solo confronti veri',
  );
  esito(
    perEuro.withoutComparison.every((r) => r.state !== 'CONFRONTATO'),
    `i ${perEuro.withoutComparison.length} senza confronto sono in un elenco separato`,
  );
  esito(
    perEuro.withoutComparison.every((r) => r.reason !== null && r.reason.length > 0),
    'ognuno dice perché non si può confrontare, invece di mostrare un trattino',
  );
  esito(
    perEuro.comparisons.length + perEuro.withoutComparison.length === perEuro.totals.products,
    `i due elenchi coprono tutti i ${perEuro.totals.products} prodotti con offerte, senza sovrapposizioni`,
  );

  console.log('\n── Criterio 4: il ricalcolo su tutto il catalogo ────────────────\n');

  const primo = await ricalcolaMiglioriOfferte(organizationId);
  console.log(
    `  catalogo reale: ${primo.prodotti} prodotti in ${primo.millisecondi} ms ` +
      `(${primo.scritture} scritture, ${primo.confrontabili} confrontabili)`,
  );

  const secondo = await ricalcolaMiglioriOfferte(organizationId);
  esito(
    secondo.scritture === 0,
    `un secondo ricalcolo a dati fermi non scrive niente (${secondo.scritture} scritture, ${secondo.millisecondi} ms)`,
  );

  // Il catalogo vero è troppo piccolo perché il tempo dica qualcosa: si moltiplica.
  console.log('\n  Moltiplico il catalogo per misurare a una scala credibile…');
  for (const giro of [1, 2, 3, 4]) {
    // In tre passi per via del riferimento circolare: `supplier_product`
    // punta al prezzo corrente e il prezzo punta all'offerta. Si inseriscono
    // le offerte senza prezzo corrente, poi i prezzi, poi si collega.
    sql(`
      INSERT INTO product (id, organization_id, name, normalized_name, unit_size, unit_of_measure,
                           base_unit, created_by, created_at, updated_at)
      SELECT id || '-x${giro}', organization_id, name || ' x${giro}', normalized_name,
             unit_size, unit_of_measure, base_unit, created_by, created_at, updated_at
      FROM product WHERE id NOT LIKE '%-x%';

      INSERT INTO supplier_product (id, organization_id, supplier_id, supplier_code, raw_name,
                                    normalized_name, fingerprint, pack_quantity, pack_quantity_confirmed,
                                    unit_size, unit_of_measure, content_per_pack, base_unit,
                                    product_id, match_status, active,
                                    first_seen_at, last_seen_at, created_at, updated_at)
      SELECT id || '-x${giro}', organization_id, supplier_id, supplier_code || '-x${giro}', raw_name,
             normalized_name, fingerprint || '-x${giro}', pack_quantity, pack_quantity_confirmed,
             unit_size, unit_of_measure, content_per_pack, base_unit,
             product_id || '-x${giro}', match_status, active,
             first_seen_at, last_seen_at, created_at, updated_at
      FROM supplier_product WHERE id NOT LIKE '%-x%' AND product_id IS NOT NULL;

      INSERT INTO supplier_product_price (id, supplier_product_id, price_list, discounts, price_net,
                                          unit_price, unit_price_basis, valid_from, source, created_at)
      SELECT p.id || '-x${giro}', p.supplier_product_id || '-x${giro}', p.price_list, p.discounts,
             p.price_net, p.unit_price, p.unit_price_basis, p.valid_from, p.source, p.created_at
      FROM supplier_product_price p
      JOIN supplier_product sp ON sp.id = p.supplier_product_id
      WHERE p.id NOT LIKE '%-x%' AND sp.product_id IS NOT NULL AND p.valid_to IS NULL;

      UPDATE supplier_product sp
      SET current_price_id = p.id
      FROM supplier_product_price p
      WHERE p.supplier_product_id = sp.id AND p.valid_to IS NULL
        AND sp.id LIKE '%-x${giro}' AND sp.current_price_id IS NULL;
    `);
  }
  sql('ANALYZE product, supplier_product;');

  const grande = await ricalcolaMiglioriOfferte(organizationId);
  console.log(
    `  catalogo moltiplicato: ${grande.prodotti} prodotti in ${grande.millisecondi} ms ` +
      `(${grande.scritture} scritture)`,
  );
  esito(
    grande.millisecondi < 5_000,
    `il ricalcolo di ${grande.prodotti} prodotti resta sotto i 5 secondi (${grande.millisecondi} ms)`,
  );

  const reportGrande = Date.now();
  const finale = await confronti.report({});
  console.log(
    `  il report su ${finale.totals.products} prodotti: ${Date.now() - reportGrande} ms, ` +
      `${finale.totals.compared} confronti, risparmio totale ${finale.totals.savingPerPack} €`,
  );

  // Pulizia delle offerte di collaudo (la copia si butta comunque, ma lasciarle
  // renderebbe illeggibile un eventuale secondo giro sulla stessa copia).
  // Prima la miglior offerta: il ricalcolo del criterio 4 l'ha fatta puntare a
  // una di queste, e la chiave esterna impedirebbe di cancellarle.
  await systemPrisma.productBestOffer.deleteMany({ where: { productId: prodotto.id } });
  await systemPrisma.supplierProduct.updateMany({
    where: { id: { in: creati } },
    data: { currentPriceId: null },
  });
  await systemPrisma.supplierProductPrice.deleteMany({
    where: { supplierProductId: { in: creati } },
  });
  await systemPrisma.supplierProduct.deleteMany({ where: { id: { in: creati } } });
  await systemPrisma.product.delete({ where: { id: prodotto.id } });

}

main()
  .then(async () => {
    await systemPrisma.$disconnect();
    console.log('');
  })
  .catch(async (errore: unknown) => {
    console.error(errore);
    await systemPrisma.$disconnect();
    process.exit(1);
  });
