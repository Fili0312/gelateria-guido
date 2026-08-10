/**
 * Che la paginazione del catalogo non perda né duplichi prodotti.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/prova-paginazione.ts
 *
 * **Legge soltanto**, quindi si può puntare anche alla produzione — anzi è
 * lì che serve, perché il difetto che verifica (il catalogo si fermava a 200
 * su 313, in silenzio) si vedeva solo con abbastanza prodotti veri.
 *
 * Tre cose, e la seconda è quella che salta più facilmente:
 *  - scorrendo tutte le pagine si vede ogni prodotto, una volta sola;
 *  - un filtro pagina sul **filtrato**, non sul catalogo intero;
 *  - l'ordine per numero di offerte vale fra le pagine e non solo dentro.
 */

import { systemPrisma } from '../src/server/database/system-client';
import { productsRepository } from '../src/server/repositories/products';
import { productListQuerySchema } from '../src/features/products/schema';

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const prodotti = productsRepository(org.id);
  const base = productListQuerySchema.parse({});

  const visti = new Set<string>();
  let pagina = 1;
  let totale = 0;
  for (;;) {
    const r = await prodotti.list({ ...base, pagina });
    if (pagina === 1)
      console.log(`filtrati=${r.filtrati} total=${r.total} perPagina=${r.perPagina}`);
    if (r.items.length === 0) break;
    for (const p of r.items) {
      if (visti.has(p.id)) throw new Error(`duplicato fra le pagine: ${p.name}`);
      visti.add(p.id);
    }
    totale += r.items.length;
    console.log(
      `  pagina ${pagina}: ${r.items.length} · da «${r.items[0]!.name.slice(0, 26)}» a «${r.items.at(-1)!.name.slice(0, 26)}»`,
    );
    if (pagina * r.perPagina >= r.filtrati) break;
    pagina += 1;
  }
  const tutti = await systemPrisma.product.count({ where: { organizationId: org.id } });
  console.log(
    `\nscorrendo le pagine si vedono ${totale} prodotti distinti; a catalogo ce ne sono ${tutti}`,
  );
  console.log(totale === tutti ? '✓ nessuno resta fuori' : '✗ ne mancano ' + (tutti - totale));

  // Un filtro deve paginare sul filtrato, non sul catalogo intero.
  const conFiltro = await prodotti.list({ ...base, q: 'rum' });
  console.log(
    `\nfiltro «rum»: ${conFiltro.filtrati} filtrati su ${conFiltro.total} · prima pagina ${conFiltro.items.length}`,
  );

  // L'ordine per numero di offerte deve valere sull'insieme, non nella pagina.
  const perOfferte = await prodotti.list({ ...base, sort: 'offers-desc', perPagina: 10 });
  const secondaPagina = await prodotti.list({
    ...base,
    sort: 'offers-desc',
    perPagina: 10,
    pagina: 2,
  });
  const minPrima = Math.min(...perOfferte.items.map((p) => p.offersCount));
  const maxSeconda = Math.max(...secondaPagina.items.map((p) => p.offersCount));
  console.log(
    `ordine per offerte: minimo in pagina 1 = ${minPrima}, massimo in pagina 2 = ${maxSeconda}`,
  );
  console.log(
    minPrima >= maxSeconda ? '✓ l’ordine vale fra le pagine' : '✗ le pagine si scavalcano',
  );

  await systemPrisma.$disconnect();
}
main().catch(async (e: unknown) => {
  console.error(e);
  await systemPrisma.$disconnect();
  process.exit(1);
});
