import Link from 'next/link';
import { ClassifyButton } from '@/components/products/classify-button';
import { ProductList } from '@/components/products/product-list';
import { ProductSearch } from '@/components/products/product-search';
import { Badge, Input, Select } from '@/components/ui';
import { productListQuerySchema } from '@/features/products/schema';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { productsRepository } from '@/server/repositories/products';
import { suppliersRepository } from '@/server/repositories/suppliers';
import { taxonomyRepository } from '@/server/repositories/taxonomy';

export const dynamic = 'force-dynamic';

/** I valori che non vale la pena scrivere nell'URL. */
const PREDEFINITI = productListQuerySchema.parse({});

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
    supplierId: primo(query.supplierId),
    packaging: primo(query.packaging),
    sort: primo(query.sort),
    pagina: primo(query.pagina),
    perPagina: primo(query.perPagina),
  });
  const filtri = analizzato.success ? analizzato.data : productListQuerySchema.parse({});
  const [risultato, tassonomia, fornitoriElenco] = await Promise.all([
    productsRepository(user.organizationId).list(filtri),
    taxonomyRepository(user.organizationId).tree({ includiInattivi: false }),
    suppliersRepository(user.organizationId).list({ q: '', status: 'active', sort: 'name-asc' }),
  ]);
  const fornitori = fornitoriElenco.items;

  const pagine = Math.max(1, Math.ceil(risultato.filtrati / risultato.perPagina));
  const mostrati = {
    da: risultato.filtrati === 0 ? 0 : (risultato.pagina - 1) * risultato.perPagina + 1,
    a: (risultato.pagina - 1) * risultato.perPagina + risultato.items.length,
  };
  /**
   * Il link a un'altra pagina si porta dietro **tutti** i filtri attivi.
   * Perderli cambierebbe l'elenco sotto i piedi: si preme «Successivi» e ci
   * si ritrova nel catalogo intero, convinti di stare ancora nel filtro.
   */
  const aPagina = (numero: number) => {
    const parametri = new URLSearchParams();
    // Si confronta coi valori predefiniti invece di elencare a mano le
    // eccezioni: aggiungendo un filtro domani, l'URL resta pulito da solo.
    for (const [chiave, valore] of Object.entries(filtri)) {
      if (chiave === 'pagina') continue;
      if (valore === PREDEFINITI[chiave as keyof typeof PREDEFINITI]) continue;
      const testo = String(valore);
      if (testo) parametri.set(chiave, testo);
    }
    if (numero > 1) parametri.set('pagina', String(numero));
    const coda = parametri.toString();
    return coda ? `/prodotti?${coda}` : '/prodotti';
  };
  const fornitoreScelto = filtri.supplierId
    ? (fornitori.find((f) => f.id === filtri.supplierId) ?? null)
    : null;
  const conFiltri =
    filtri.q !== '' ||
    filtri.departmentId !== '' ||
    filtri.categoryId !== '' ||
    filtri.classification !== 'all' ||
    filtri.supplierId !== '' ||
    filtri.packaging !== 'all' ||
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
          {/* Quanti se ne stanno vedendo, non solo quanti ce ne sono: prima
              diceva «313 prodotti» mostrandone 200, e i 113 mancanti non li
              segnalava nessuno. */}
          {risultato.filtrati === 0 ? (
            <strong className="text-neutral-950">Nessuno dei {risultato.total} prodotti</strong>
          ) : (
            <>
              <strong className="text-neutral-950">
                {mostrati.da}–{mostrati.a}
              </strong>{' '}
              di {risultato.filtrati}
              {risultato.filtrati !== risultato.total && <> filtrati su {risultato.total}</>}{' '}
              prodotti
            </>
          )}{' '}
          · {risultato.orphan > 0 && <>{risultato.orphan} senza offerte · </>}
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
          <span aria-hidden className="text-neutral-400 group-open:rotate-90">
            ›
          </span>
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
          {/* «Classificazione» e «Offerte» erano due filtri che nessuno usava:
            il primo perché i prodotti sono tutti classificati, il secondo
            perché un prodotto senza offerte è un caso raro e si vede
            dall'elenco. Al loro posto il fornitore, che è il modo in cui si
            guarda il catalogo quando si sistema un accordo. */}
          <Select name="supplierId" label="Fornitore" defaultValue={filtri.supplierId}>
            <option value="">Tutti</option>
            {fornitori.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.extraDiscountPct ? ` · −${f.extraDiscountPct}%` : ''}
              </option>
            ))}
          </Select>
          {/* La coda che tiene i prodotti fuori dai confronti: senza un
              filtro la si trova solo scorrendo trecento righe. */}
          <Select name="packaging" label="Confezione" defaultValue={filtri.packaging}>
            <option value="all">Tutte</option>
            <option value="da-definire">Numero di pezzi non definito</option>
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

      {/* Filtrare per un fornitore senza sconto e non vedere nessun pulsante
          è un'assenza muta: sembra che la funzione non ci sia. Qui si dice
          perché e dove si mette. */}
      {fornitoreScelto && !fornitoreScelto.extraDiscountPct && (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-600">
          <strong className="text-neutral-900">{fornitoreScelto.name}</strong> non ha uno sconto
          extra concordato, quindi accanto ai suoi prodotti non compare nessun pulsante.{' '}
          <Link
            href={`/fornitori/${fornitoreScelto.id}`}
            className="text-brand-700 cursor-pointer font-semibold hover:underline"
          >
            Impostalo nella scheda prodotto →
          </Link>{' '}
          e da qui potrai dire prodotto per prodotto se lo sconto si applica.
        </p>
      )}
      {fornitoreScelto?.extraDiscountPct && (
        <p className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm leading-6 text-neutral-700">
          <strong className="text-neutral-900">{fornitoreScelto.name}</strong> sconta il{' '}
          <strong>{fornitoreScelto.extraDiscountPct}%</strong> su tutti questi articoli. Premi il
          pulsante viola accanto a un prodotto per escluderlo dall’accordo.
        </p>
      )}

      <ProductList
        items={risultato.items}
        conFiltri={conFiltri}
        endpoint={withBasePath('/api/products')}
        endpointOfferte={withBasePath('/api/supplier-products')}
        endpointConfezioni={withBasePath('/api/supplier-products/confezioni')}
      />

      {pagine > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagine">
          {filtri.pagina > 1 ? (
            <Link
              href={aPagina(filtri.pagina - 1)}
              className="min-h-11 cursor-pointer rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
            >
              ← Precedenti
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-neutral-500">
            pagina {filtri.pagina} di {pagine}
          </span>
          {filtri.pagina < pagine ? (
            <Link
              href={aPagina(filtri.pagina + 1)}
              className="min-h-11 cursor-pointer rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
            >
              Successivi →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
