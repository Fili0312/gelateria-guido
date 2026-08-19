import Link from 'next/link';
import { ComparisonTable } from '@/components/comparison/comparison-table';
import { DuplicatesFinder } from '@/components/matching/duplicates-finder';
import { MatchingQueue } from '@/components/matching/queue';
import { Badge, Input, Select } from '@/components/ui';
import { codaQuerySchema } from '@/features/matching/schema';
import { euro, numero } from '@/features/products/format';
import type { ComparisonSort } from '@/features/reports/dto';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { comparisonRepository } from '@/server/repositories/comparison';
import { matchingRepository } from '@/server/repositories/matching';
import { taxonomyRepository } from '@/server/repositories/taxonomy';

export const dynamic = 'force-dynamic';

/**
 * Confronti: il lavoro e il risultato, sulla stessa pagina.
 *
 * Prima erano due voci di menu — «Da abbinare» e «Convenienti» — e la
 * separazione era comoda per chi ha scritto il codice, non per chi lo usa:
 * la prima è **il motivo per cui** la seconda è mezza vuota. Chi guardava i
 * confronti non aveva modo di sapere che ne mancavano venti, e che stavano
 * dietro un'altra voce di menu.
 *
 * L'ordine è quello del lavoro: **analizza** cosa si può ancora collegare,
 * **decidi** ciò su cui serve una persona, **guarda** dove conviene comprare.
 * Le prime due sezioni spariscono quando non c'è niente da fare — una
 * sezione che dice «zero» occupa lo spazio di una che dice qualcosa.
 */

const ORDINI: ComparisonSort[] = ['saving-desc', 'saving-pct-desc', 'name-asc'];

function hrefPagina(
  parametri: Record<string, string | string[] | undefined>,
  pagina: number,
): string {
  const query = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(parametri)) {
    if (valore === undefined || chiave === 'pagina') continue;
    for (const elemento of Array.isArray(valore) ? valore : [valore])
      query.append(chiave, elemento);
  }
  query.set('pagina', String(pagina));
  return `?${query.toString()}`;
}

export default async function ConfrontiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const grezzi = await searchParams;
  const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const sortGrezzo = primo(grezzi.sort) as ComparisonSort | undefined;

  const query = {
    q: primo(grezzi.q),
    departmentId: primo(grezzi.departmentId),
    categoryId: primo(grezzi.categoryId),
    bestSupplierId: primo(grezzi.bestSupplierId),
    onlyAlert: primo(grezzi.onlyAlert) === '1',
    sort: sortGrezzo && ORDINI.includes(sortGrezzo) ? sortGrezzo : ('saving-desc' as const),
  };

  const codaQuery = codaQuerySchema.safeParse({
    priceListId: primo(grezzi.priceListId),
    stato: primo(grezzi.stato),
    limite: primo(grezzi.limite),
    pagina: primo(grezzi.pagina),
  });

  const [report, tassonomia, coda] = await Promise.all([
    comparisonRepository(user.organizationId).report(query),
    taxonomyRepository(user.organizationId).tree({ includiInattivi: false }),
    matchingRepository(user.organizationId).coda(
      codaQuery.success ? codaQuery.data : codaQuerySchema.parse({}),
    ),
  ]);
  const t = report.totals;

  const fornitori = [
    ...new Map(
      report.comparisons
        .filter((r) => r.best)
        .map((r) => [r.best!.supplierId, r.best!.supplierName] as const),
    ),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));

  return (
    <div className="space-y-5">
      <header>
        <Badge variant="brand" dot>
          Confronto prezzi
        </Badge>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          Confronti
        </h1>
        <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
          Dove conviene comprare, prodotto per prodotto. Il confronto è sul{' '}
          <strong>prezzo per litro o per chilo</strong>, non su quello della confezione.
        </p>
      </header>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl border border-neutral-200 bg-white px-5 py-4">
        <span className="tabellare text-3xl font-extrabold tracking-[-0.03em] text-neutral-950">
          {euro(t.savingPerPack)}
        </span>
        <span className="text-sm text-neutral-600">
          risparmiabili su <strong>{t.compared}</strong> confronti, una confezione per prodotto
        </span>
        <span className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          {t.worthAlert > 0 && (
            <span className="font-semibold text-green-700">
              {t.worthAlert} oltre {numero(report.thresholds.percentage, 1)}% e{' '}
              {euro(report.thresholds.euro)}
            </span>
          )}
          <span>{t.singleOffer} con un solo fornitore: niente da confrontare</span>
          {t.stale > 0 && (
            <span className="text-amber-700">
              {t.stale} con prezzi fermi da oltre {report.thresholds.staleMonths} mesi
            </span>
          )}
        </span>
      </div>

      {/* 1. Analizza: cosa si può ancora portare dentro i confronti. */}
      <DuplicatesFinder
        endpointCerca={withBasePath('/api/products/duplicates')}
        endpointUnisci={withBasePath('/api/products/merge')}
      />

      {/* 2. Decidi: le righe di listino su cui l'app non se l'è sentita. */}
      {coda.totale > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-extrabold text-neutral-950">
              {coda.daRivedere} righe di listino aspettano una decisione
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500">
              Ogni fornitore chiama le cose a modo suo. Qui si decide{' '}
              <strong>quali righe sono lo stesso articolo</strong> di un prodotto già a catalogo:
              confermando, le due offerte si affiancano e cominciano a confrontarsi — restano
              separate, ognuna col suo codice e il suo prezzo. Ogni conferma diventa un sinonimo, e
              al listino successivo quella scritta si abbina da sola. Il catalogo non cambia finché
              non applichi l’import.
            </p>
          </div>
          <MatchingQueue
            iniziale={coda}
            endpoint={withBasePath('/api/matching')}
            hrefPrecedente={coda.haPrecedente ? hrefPagina(grezzi, coda.paginaCorrente - 1) : null}
            hrefSuccessiva={coda.haSuccessiva ? hrefPagina(grezzi, coda.paginaCorrente + 1) : null}
          />
        </section>
      )}

      {/* 3. Guarda: il risultato. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold text-neutral-950">
            {report.comparisons.length === t.compared
              ? `${t.compared} confronti`
              : `${report.comparisons.length} confronti su ${t.compared}`}
          </h2>
          <details className="group text-sm">
            <summary className="cursor-pointer font-semibold text-neutral-700 hover:text-neutral-950">
              Filtra e ordina
            </summary>
            <form className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5" role="search">
              <Input
                name="q"
                label="Filtra l’elenco"
                defaultValue={query.q ?? ''}
                placeholder="Nome del prodotto"
              />
              <Select name="departmentId" label="Reparto" defaultValue={query.departmentId ?? ''}>
                <option value="">Tutti</option>
                {tassonomia.departments.map((reparto) => (
                  <option key={reparto.id} value={reparto.id}>
                    {reparto.name}
                  </option>
                ))}
              </Select>
              <Select name="categoryId" label="Categoria" defaultValue={query.categoryId ?? ''}>
                <option value="">Tutte</option>
                {tassonomia.departments.map((reparto) => (
                  <optgroup key={reparto.id} label={reparto.name}>
                    {reparto.categories.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              <Select
                name="bestSupplierId"
                label="Conviene da"
                defaultValue={query.bestSupplierId ?? ''}
              >
                <option value="">Tutti</option>
                {fornitori.map((fornitore) => (
                  <option key={fornitore.id} value={fornitore.id}>
                    {fornitore.name}
                  </option>
                ))}
              </Select>
              <Select name="sort" label="Ordina" defaultValue={query.sort}>
                <option value="saving-desc">Risparmio in euro</option>
                <option value="saving-pct-desc">Risparmio in percentuale</option>
                <option value="name-asc">Nome (A→Z)</option>
              </Select>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm text-neutral-700 sm:col-span-2">
                <input
                  type="checkbox"
                  name="onlyAlert"
                  value="1"
                  defaultChecked={query.onlyAlert}
                  className="text-brand-600 focus-visible:ring-brand-600 h-5 w-5 rounded border-neutral-300"
                />
                Solo quelli che superano entrambe le soglie
              </label>
              <div className="sm:col-span-3 lg:col-span-5">
                <button
                  type="submit"
                  className="focus-visible:ring-brand-600 min-h-11 cursor-pointer rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400 focus-visible:ring-2 focus-visible:outline-none"
                >
                  Applica i filtri
                </button>
              </div>
            </form>
          </details>
        </div>
        <ComparisonTable righe={report.comparisons} confrontiTotali={t.compared} />
      </section>

      {report.withoutComparison.length > 0 && (
        <details className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-5 py-4 font-bold text-neutral-900 hover:bg-neutral-50">
            {report.withoutComparison.length} prodotti senza confronto
          </summary>
          <p className="border-t border-neutral-100 px-5 py-3 text-sm leading-6 text-neutral-500">
            Restano separati dai confronti veri: hanno un solo fornitore, un prezzo mancante oppure
            confezioni che non permettono un confronto affidabile.
          </p>
          <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
            {report.withoutComparison.map((riga) => (
              <li key={riga.productId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Link
                  href={`/prodotti/${riga.productId}`}
                  className="focus-visible:ring-brand-600 min-w-0 flex-1 font-semibold text-neutral-950 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                  {riga.productName}
                </Link>
                <Badge variant="neutral">
                  {riga.state === 'OFFERTA_UNICA'
                    ? 'un solo fornitore'
                    : riga.state === 'SENZA_PREZZO'
                      ? 'senza prezzo'
                      : 'confezione non confrontabile'}
                </Badge>
                <span className="text-sm text-neutral-500">{riga.reason ?? 'Da verificare'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Link href="/prodotti" className="inline-block text-sm text-neutral-500 hover:underline">
        ← Catalogo
      </Link>
    </div>
  );
}
