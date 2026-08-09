import Link from 'next/link';
import { ClassifyButton } from '@/components/products/classify-button';
import { ProductList } from '@/components/products/product-list';
import { ProductSearch } from '@/components/products/product-search';
import { Badge, Input, Select } from '@/components/ui';
import { productListQuerySchema } from '@/features/products/schema';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { productsRepository } from '@/server/repositories/products';
import { taxonomyRepository } from '@/server/repositories/taxonomy';

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
    departmentId: primo(query.departmentId),
    categoryId: primo(query.categoryId),
    classification: primo(query.classification),
    status: primo(query.status),
    sort: primo(query.sort),
  });
  const filtri = analizzato.success ? analizzato.data : productListQuerySchema.parse({});
  const [risultato, tassonomia] = await Promise.all([
    productsRepository(user.organizationId).list(filtri),
    taxonomyRepository(user.organizationId).tree({ includiInattivi: false }),
  ]);
  const conFiltri =
    filtri.q !== '' ||
    filtri.departmentId !== '' ||
    filtri.categoryId !== '' ||
    filtri.classification !== 'all' ||
    filtri.status !== 'all';

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
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/prodotti/reparti"
            className="focus-visible:ring-brand-600 inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
          >
            Reparti e categorie
          </Link>
          <Link
            href="/prodotti/nuovo"
            className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
          >
            Nuovo prodotto
          </Link>
        </div>
      </header>

      <ProductSearch endpoint={withBasePath('/api/products/search')} />

      {/* I quattro riquadri di prima («Prodotti», «Con offerte», «Senza
          offerte», «Da classificare») erano conteggi d'anagrafica: veri e
          inerti. Quello che resta è la sola riga che fa fare qualcosa. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          <strong className="text-neutral-950">{risultato.total}</strong> prodotti ·{' '}
          {risultato.orphan > 0 && <>{risultato.orphan} senza offerte · </>}
          {risultato.unclassified > 0 ? (
            <span className="text-amber-700">{risultato.unclassified} senza categoria</span>
          ) : (
            <span className="text-green-700">tutti classificati</span>
          )}
        </p>
        <ClassifyButton
          endpoint={withBasePath('/api/products/classify')}
          daClassificare={risultato.unclassified}
        />
      </div>

      {/* Due caselle di ricerca sulla stessa schermata fanno chiedere ogni
          volta quale delle due cerca «davvero». Quella grande sopra è la
          ricerca vera — nomi, sinonimi, codici; qui restano i filtri, che si
          usano di rado e stavano occupando mezza pagina. */}
      <details className="group rounded-2xl border border-neutral-200 bg-white px-4 py-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-800">
          Filtra e ordina l’elenco
          <span aria-hidden className="text-neutral-400 group-open:rotate-90">›</span>
        </summary>
      <form className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5" role="search">
        <Input
          name="q"
          label="Filtra l’elenco"
          defaultValue={filtri.q}
          placeholder="Nome del prodotto"
        />
        <Select name="departmentId" label="Reparto" defaultValue={filtri.departmentId}>
          <option value="">Tutti</option>
          {tassonomia.departments.map((reparto) => (
            <option key={reparto.id} value={reparto.id}>
              {reparto.name} ({reparto.productsCount})
            </option>
          ))}
        </Select>
        {/* La categoria puntuale, con i reparti come gruppi: chi sa già cosa
            cerca la sceglie qui e salta il filtro per reparto, che è meno
            preciso ma più veloce da usare. */}
        <Select name="categoryId" label="Categoria" defaultValue={filtri.categoryId}>
          <option value="">Tutte</option>
          {tassonomia.departments.map((reparto) => (
            <optgroup key={reparto.id} label={reparto.name}>
              {reparto.categories.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.name} ({categoria.productsCount})
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select name="classification" label="Classificazione" defaultValue={filtri.classification}>
          <option value="all">Tutti</option>
          <option value="classified">Con categoria</option>
          <option value="unclassified">Da classificare</option>
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
        <div className="sm:col-span-3 lg:col-span-5">
          <button
            type="submit"
            className="focus-visible:ring-brand-600 min-h-11 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
          >
            Applica i filtri
          </button>
        </div>
      </form>
      </details>

      <ProductList
        items={risultato.items}
        conFiltri={conFiltri}
        endpoint={withBasePath('/api/products')}
      />
    </div>
  );
}
