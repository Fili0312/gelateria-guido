import Link from 'next/link';
import { ProductList } from '@/components/products/product-list';
import { ProductSearch } from '@/components/products/product-search';
import { Badge, Input, Select } from '@/components/ui';
import { productListQuerySchema } from '@/features/products/schema';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { productsRepository } from '@/server/repositories/products';

export const dynamic = 'force-dynamic';

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const query = await searchParams;
  const analizzato = productListQuerySchema.safeParse({
    q: primo(query.q),
    category: primo(query.category),
    status: primo(query.status),
    sort: primo(query.sort),
  });
  const filtri = analizzato.success ? analizzato.data : productListQuerySchema.parse({});
  const risultato = await productsRepository(user.organizationId).list(filtri);
  const conFiltri = filtri.q !== '' || filtri.category !== '' || filtri.status !== 'all';

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Badge variant="brand" dot>
            Catalogo
          </Badge>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
            Prodotti
          </h1>
          <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
            Un prodotto è l’articolo con il suo formato — «Birra XYZ, 33 cl» — e le offerte dei
            fornitori gli si collegano sopra. È questo che permette di confrontare confezioni
            diverse dello stesso articolo.
          </p>
        </div>
        <Link
          href="/prodotti/nuovo"
          className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
        >
          Nuovo prodotto
        </Link>
      </header>

      <ProductSearch endpoint={withBasePath('/api/products/search')} />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { etichetta: 'Prodotti', valore: risultato.total },
          { etichetta: 'Con almeno un’offerta', valore: risultato.linked },
          { etichetta: 'Senza offerte', valore: risultato.orphan },
        ].map((riquadro) => (
          <div
            key={riquadro.etichetta}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3"
          >
            <dt className="text-xs text-neutral-500">{riquadro.etichetta}</dt>
            <dd className="tabellare mt-1 text-2xl font-black text-neutral-950">
              {riquadro.valore}
            </dd>
          </div>
        ))}
      </dl>

      <form className="grid gap-3 sm:grid-cols-4" role="search">
        <Input
          name="q"
          label="Filtra l’elenco"
          defaultValue={filtri.q}
          placeholder="Nome del prodotto"
        />
        <Select name="category" label="Categoria" defaultValue={filtri.category}>
          <option value="">Tutte</option>
          {risultato.categories.map((categoria) => (
            <option key={categoria} value={categoria}>
              {categoria}
            </option>
          ))}
        </Select>
        <Select name="status" label="Offerte" defaultValue={filtri.status}>
          <option value="all">Tutti</option>
          <option value="linked">Con offerte</option>
          <option value="orphan">Senza offerte</option>
        </Select>
        <Select name="sort" label="Ordina" defaultValue={filtri.sort}>
          <option value="name-asc">Nome (A→Z)</option>
          <option value="name-desc">Nome (Z→A)</option>
          <option value="updated-desc">Modificati di recente</option>
          <option value="offers-desc">Più offerte</option>
        </Select>
        <div className="sm:col-span-4">
          <button
            type="submit"
            className="focus-visible:ring-brand-600 min-h-11 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
          >
            Applica i filtri
          </button>
        </div>
      </form>

      <ProductList items={risultato.items} conFiltri={conFiltri} />
    </div>
  );
}
