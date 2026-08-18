import {
  caricaCatalogoAdBeverage,
  estraiImmagineAdBeverage,
  trovaMiglioreAdBeverage,
} from '../src/server/catalog/immagini/ad-beverage.js';
import { type DatiProdotto } from '../src/server/catalog/immagini/index.js';
import { systemPrisma } from '../src/server/database/system-client.js';

/**
 * Dry-run read-only: non aggiorna il DB, non salva immagini e non invia
 * nomi locali a OFF. Il confronto usa gli esiti OFF gia' registrati.
 */
const GRUPPI = [
  ['Vodka', /vodka/i],
  ['Gin', /gin/i],
  ['Rum', /rum/i],
  ['Amaro', /amaro/i],
  ['Liquore', /liquore/i],
  ['Aperitivo/Bitter', /aperitivo|bitter/i],
  ['Acqua', /acqua/i],
  ['Bibite', /analcolico|bibita|bevanda|succo/i],
  // Le referenze vinicole AD collegate sono classificate come Spumante.
  ['Vino/Spumante', /vino|spumante|champagne|prosecco/i],
] as const;

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
function gruppoDi(categoria: string | null): string | null {
  return GRUPPI.find(([, re]) => re.test(categoria ?? ''))?.[0] ?? null;
}
function campione<T extends { category: { name: string } | null }>(
  prodotti: readonly T[],
  n: number,
): T[] {
  const gruppi = new Map<string, T[]>(GRUPPI.map(([nome]) => [nome, []]));
  for (const p of prodotti) {
    const g = gruppoDi(p.category?.name ?? null);
    if (g) gruppi.get(g)!.push(p);
  }
  const scelti: T[] = [];
  while (scelti.length < n) {
    let aggiunti = 0;
    for (const [nome] of GRUPPI) {
      const p = gruppi.get(nome)!.shift();
      if (!p) continue;
      scelti.push(p);
      aggiunti += 1;
      if (scelti.length === n) break;
    }
    if (!aggiunti) break;
  }
  return scelti;
}

async function main() {
  const quanti = Number(argomento('--quanti') ?? '30');
  if (!Number.isInteger(quanti) || quanti < 30) throw new Error('--quanti deve essere almeno 30.');
  const fornitore = await systemPrisma.supplier.findFirstOrThrow({
    where: { name: { equals: 'AD Beverage', mode: 'insensitive' }, active: true },
    select: { id: true },
  });
  const prodottiAd = await systemPrisma.product.findMany({
    where: { supplierProducts: { some: { supplierId: fornitore.id, active: true } } },
    select: {
      id: true,
      name: true,
      brand: true,
      gtin: true,
      imagePath: true,
      imageSource: true,
      imageConfidence: true,
      unitSize: true,
      unitOfMeasure: true,
      category: { select: { name: true } },
      supplierProducts: {
        where: { active: true },
        select: { supplier: { select: { name: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });
  const scelti = campione(prodottiAd, quanti);
  if (scelti.length < quanti)
    throw new Error(`solo ${scelti.length} prodotti nelle categorie richieste.`);
  const catalogo = await caricaCatalogoAdBeverage();
  const distribuzione = new Map<string, number>();
  for (const p of scelti) {
    const g = gruppoDi(p.category?.name ?? null) ?? 'Altro';
    distribuzione.set(g, (distribuzione.get(g) ?? 0) + 1);
  }
  console.log(
    `Fonte: Supabase pubblico usato da catalogo.js · ${catalogo.length} prodotti AD attivi`,
  );
  console.log(
    `Campione locale: ${scelti.length}/${prodottiAd.length} prodotti collegati · ` +
      [...distribuzione].map(([g, n]) => `${g} ${n}`).join(' · '),
  );
  console.log('Confronto OFF: esiti gia registrati (nessun dato inviato fuori)\n');

  let fotoAd = 0,
    fotoOff = 0,
    soloAd = 0,
    scartati = 0,
    dubbi = 0;
  for (const [i, p] of scelti.entries()) {
    const dati: DatiProdotto = {
      name: p.name,
      brand: p.brand,
      gtin: p.gtin,
      unitSize: p.unitSize.toString(),
      unitOfMeasure: p.unitOfMeasure,
      categoria: p.category?.name ?? null,
      fornitori: p.supplierProducts.map((o) => o.supplier.name),
    };
    const ad = trovaMiglioreAdBeverage(dati, catalogo);
    const haAd = Boolean(ad.accettato && ad.prodotto && estraiImmagineAdBeverage(ad.prodotto));
    if (haAd) fotoAd += 1;
    if (ad.prodotto && !ad.accettato) scartati += 1;
    if (ad.dubbio) dubbi += 1;
    const confidenzaOff = p.imageConfidence ? Number(p.imageConfidence.toString()) : null;
    const haOff = Boolean(
      p.imageSource === 'OFF' && p.imagePath && confidenzaOff !== null && confidenzaOff >= 0.8,
    );
    if (haOff) fotoOff += 1;
    if (haAd && !haOff) soloAd += 1;
    console.log(`[${i + 1}/${scelti.length}] ${p.name}`);
    console.log(`  → ${ad.prodotto?.nome ?? 'nessun candidato'}`);
    console.log(`  → confidence ${ad.confidenza.toFixed(3)}`);
    console.log(`  → formato ${ad.formatoLocale ?? '—'} / ${ad.formatoAd ?? '—'}`);
    console.log(`  → immagine ${haAd ? 'SI' : 'NO'}`);
    console.log(`  → ${ad.accettato ? 'ACCETTATO' : 'SCARTATO'}: ${ad.motivo}`);
    console.log(
      `  → OFF ${haOff ? 'SI' : 'NO'}${confidenzaOff !== null ? ` (${confidenzaOff.toFixed(3)})` : ''}`,
    );
    console.log('');
  }
  console.log('RIEPILOGO');
  console.log(`prodotti testati: ${scelti.length}`);
  console.log(`foto trovate AD Beverage: ${fotoAd}`);
  console.log(`foto trovate Open Food Facts sugli stessi: ${fotoOff}`);
  console.log(`foto trovate da AD Beverage che OFF non trovava: ${soloAd}`);
  console.log(`match scartati per sicurezza: ${scartati}`);
  console.log(`match dubbi: ${dubbi}`);
  console.log('\nDry-run concluso: nessun record e nessuna immagine sono stati scritti.');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => systemPrisma.$disconnect());
