import Link from 'next/link';
import { AiReading } from '@/components/comparison/ai-reading';
import { ComparisonTable, NoComparisonTable } from '@/components/comparison/comparison-table';
import { Badge, Input, Select } from '@/components/ui';
import { euro, numero } from '@/features/products/format';
import type { ComparisonSort } from '@/features/reports/dto';
import { getCurrentUser } from '@/server/auth';
import { withBasePath } from '@/server/base-path';
import { comparisonRepository } from '@/server/repositories/comparison';
import { taxonomyRepository } from '@/server/repositories/taxonomy';

export const dynamic = 'force-dynamic';

const ORDINI: ComparisonSort[] = ['saving-desc', 'saving-pct-desc', 'name-asc'];

export default async function ConvenientiPage({
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

  const [report, tassonomia] = await Promise.all([
    comparisonRepository(user.organizationId).report(query),
    taxonomyRepository(user.organizationId).tree({ includiInattivi: false }),
  ]);
  const t = report.totals;

  // I fornitori del filtro sono quelli che **vincono** almeno un confronto:
  // elencare tutti farebbe scegliere opzioni che danno sempre zero risultati.
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
    <div className="space-y-7">
      <header>
        <Badge variant="brand" dot>
          Confronto prezzi
        </Badge>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-neutral-950 sm:text-4xl">
          Convenienti
        </h1>
        <p className="mt-2 max-w-2xl leading-6 text-neutral-500">
          Dove conviene comprare, prodotto per prodotto. Il confronto è sul{' '}
          <strong>prezzo per litro o per chilo</strong>, non su quello della confezione.
        </p>
      </header>

      {/* Cinque riquadri per cinque numeri erano cinque volte lo spazio di una
          riga che li dice tutti. Quello che conta è uno solo: quanto si
          risparmia. Il resto è contesto, e sta in piccolo di fianco. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl border border-neutral-200 bg-white px-5 py-4">
        <span className="tabellare text-3xl font-black tracking-[-0.03em] text-neutral-950">
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
          <span>{t.singleOffer} con un solo fornitore</span>
          {t.stale > 0 && (
            <span className="text-amber-700">
              {t.stale} con prezzi fermi da oltre {report.thresholds.staleMonths} mesi
            </span>
          )}
        </span>
      </div>

      <details className="group rounded-2xl border border-neutral-200 bg-white px-4 py-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-800">
          Filtra e ordina
          <span aria-hidden className="text-neutral-400 group-open:rotate-90">›</span>
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
        {/* Solo i fornitori che vincono almeno un confronto: elencarli tutti
            offrirebbe scelte che danno sempre zero risultati. */}
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
        <label className="flex items-center gap-2 text-sm text-neutral-700 sm:col-span-2">
          <input
            type="checkbox"
            name="onlyAlert"
            value="1"
            defaultChecked={query.onlyAlert}
            className="text-brand-600 focus-visible:ring-brand-600 h-4 w-4 rounded border-neutral-300"
          />
          Solo quelli che superano entrambe le soglie
        </label>
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

      <AiReading
        endpoint={withBasePath('/api/reports/convenient/analyze')}
        disponibile={t.compared > 0}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-black text-neutral-950">
          {report.comparisons.length === t.compared
            ? `${t.compared} confronti`
            : `${report.comparisons.length} confronti su ${t.compared}`}
        </h2>
        <ComparisonTable righe={report.comparisons} confrontiTotali={t.compared} />
      </section>

      {report.withoutComparison.length > 0 && (
        <section className="space-y-3 border-t border-neutral-200 pt-7">
          <h2 className="text-lg font-black text-neutral-950">
            Senza confronto: {report.withoutComparison.length}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-neutral-500">
            Tenuti separati di proposito. Un prodotto che ha un solo fornitore non è «pari»: è un
            prodotto su cui non si può ancora scegliere, ed è un’informazione diversa.
          </p>
          <NoComparisonTable righe={report.withoutComparison} />
        </section>
      )}

      <Link href="/prodotti" className="inline-block text-sm text-neutral-500 hover:underline">
        ← Catalogo
      </Link>
    </div>
  );
}
