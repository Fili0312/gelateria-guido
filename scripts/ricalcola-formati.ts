import { Decimal } from 'decimal.js';
import { systemPrisma } from '../src/server/database/system-client.js';
import { analizzaFormato } from '../src/server/domain/packaging/parse.js';
import { improntaDaCampi } from '../src/server/domain/packaging/fingerprint.js';
import { baseDi, type BaseUnit, type UnitOfMeasure } from '../src/server/domain/packaging/units.js';

/**
 * Rilegge il formato delle offerte e riallinea prodotti, impronte e prezzi.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/ricalcola-formati.ts --scrivi
 *
 * ── Perché esiste ───────────────────────────────────────────────────────
 * Quando il lettore dei formati impara qualcosa di nuovo — per esempio che
 * un «LT» isolato è un litro — quello che ha già letto male resta scritto
 * com'era. E le due cose **devono** dire la stessa cosa: l'impronta con cui
 * il prossimo listino riconosce «questa riga l'ho già vista» è costruita
 * anche sull'unità di misura. Correggere solo il lettore farebbe calcolare
 * al prossimo import un'impronta diversa da quella salvata: non
 * riconoscerebbe l'offerta, ne creerebbe una nuova, e lo storico prezzi si
 * spezzerebbe in due tronconi.
 *
 * ── Cosa tocca e cosa no ────────────────────────────────────────────────
 * Tocca **come è descritta** la merce: unità, contenuto, impronta, e il
 * prezzo per unità che ne discende. Non tocca **quanto costa**: `priceNet`
 * resta quello del listino, e nessuna riga viene creata o cancellata.
 *
 * Di default non scrive niente e stampa cosa cambierebbe.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');

async function main() {
  const scrivi = process.argv.includes('--scrivi');

  const offerte = await systemPrisma.supplierProduct.findMany({
    select: {
      id: true,
      rawName: true,
      packagingType: true,
      packQuantity: true,
      unitSize: true,
      unitOfMeasure: true,
      contentPerPack: true,
      baseUnit: true,
      fingerprint: true,
      supplier: { select: { name: true } },
      product: { select: { id: true, name: true, unitOfMeasure: true, unitSize: true } },
      prices: { select: { id: true, priceNet: true, unitPrice: true, unitPriceBasis: true } },
    },
  });

  const daCambiare: {
    id: string;
    riga: string;
    fornitore: string;
    prima: string;
    dopo: string;
    unitSize: Decimal;
    uom: UnitOfMeasure;
    contenuto: Decimal;
    base: BaseUnit;
    impronta: string;
    productId: string | null;
    prezzi: { id: string; unitario: string; base: 'PER_PIECE' | 'PER_KG' | 'PER_L' }[];
  }[] = [];

  for (const o of offerte) {
    const letto = analizzaFormato(o.rawName, { unitaDiVendita: o.packagingType });
    if (letto.unitOfMeasure === o.unitOfMeasure && letto.unitSize.equals(o.unitSize.toString())) {
      continue;
    }

    // I pezzi per confezione restano quelli che sono: il lettore ha cambiato
    // idea sull'unità, non su quante bottiglie ci sono nel collo — e quello
    // è un dato che qualcuno può aver corretto a mano dall'app.
    const contenuto = new Decimal(o.packQuantity).times(letto.unitSize);
    const base = baseDi(letto.unitOfMeasure);
    const impronta = improntaDaCampi({
      descrizione: o.rawName,
      unitaDiVendita: o.packagingType,
      unitSize: letto.unitSize.toString(),
      unitOfMeasure: letto.unitOfMeasure,
      packQuantity: o.packQuantity,
    });

    const perUnita: 'PER_PIECE' | 'PER_KG' | 'PER_L' =
      base === 'PIECE' ? 'PER_PIECE' : base === 'KG' ? 'PER_KG' : 'PER_L';
    daCambiare.push({
      id: o.id,
      riga: o.rawName,
      fornitore: o.supplier.name,
      prima: `${o.unitSize.toString()} ${o.unitOfMeasure} (${o.baseUnit})`,
      dopo: `${letto.unitSize.toString()} ${letto.unitOfMeasure} (${base})`,
      unitSize: letto.unitSize,
      uom: letto.unitOfMeasure,
      contenuto,
      base,
      impronta,
      productId: o.product?.id ?? null,
      prezzi: o.prices.map((p) => ({
        id: p.id,
        unitario: new Decimal(p.priceNet.toString()).dividedBy(contenuto).toFixed(6),
        base: perUnita,
      })),
    });
  }

  console.log(`${offerte.length} offerte esaminate · ${daCambiare.length} da riallineare\n`);
  for (const c of daCambiare) {
    console.log(
      `  ${c.riga.slice(0, 40).padEnd(40)} ${c.fornitore.padEnd(12)} ${c.prima} → ${c.dopo}`,
    );
    for (const p of c.prezzi.slice(0, 1)) {
      console.log(`      prezzo per unità: ${p.unitario} ${p.base}  (${c.prezzi.length} storici)`);
    }
  }

  if (!scrivi) {
    console.log('\nNulla è stato scritto. Rilancia con --scrivi.');
    return;
  }

  const prodotti = new Set<string>();
  for (const c of daCambiare) {
    await systemPrisma.supplierProduct.update({
      where: { id: c.id },
      data: {
        unitSize: c.unitSize.toString(),
        unitOfMeasure: c.uom,
        contentPerPack: c.contenuto.toString(),
        baseUnit: c.base,
        fingerprint: c.impronta,
        prices: {
          update: c.prezzi.map((p) => ({
            where: { id: p.id },
            data: { unitPrice: p.unitario, unitPriceBasis: p.base },
          })),
        },
      },
    });
    if (c.productId) prodotti.add(c.productId);
  }

  // Il prodotto canonico segue le sue offerte: se erano tutte «pezzo» e ora
  // sono litri, la scheda deve dire litri — è il campo su cui il cercatore
  // di doppioni decide se due schede sono confrontabili.
  let schede = 0;
  for (const id of prodotti) {
    const offerte = await systemPrisma.supplierProduct.findMany({
      where: { productId: id, active: true },
      select: { unitSize: true, unitOfMeasure: true, baseUnit: true },
    });
    const prima = offerte[0];
    if (!prima) continue;
    const concordi = offerte.every(
      (o) => o.unitOfMeasure === prima.unitOfMeasure && o.unitSize.equals(prima.unitSize),
    );
    if (!concordi) continue;
    await systemPrisma.product.update({
      where: { id },
      data: {
        unitSize: prima.unitSize,
        unitOfMeasure: prima.unitOfMeasure,
        baseUnit: prima.baseUnit,
      },
    });
    schede += 1;
  }

  console.log(`\n${daCambiare.length} offerte riallineate · ${schede} schede prodotto aggiornate.`);
}

main()
  .catch((errore: unknown) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => systemPrisma.$disconnect());
