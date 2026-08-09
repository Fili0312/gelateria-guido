import Link from 'next/link';
import { ComparisonTable, NoComparisonTable } from '@/components/comparison/comparison-table';
import { Badge, Input, Select } from '@/components/ui';
import { euro, numero } from '@/features/products/format';
import type { ComparisonSort } from '@/features/reports/dto';
import { getCurrentUser } from '@/server/auth';
import { comparisonRepository } from '@/server/repositories/comparison';
import { taxonomyRepository } from '@/server/repositories/taxonomy';

export const dynamic = 'force-dynamic';

function Riquadro({
  etichetta,
  valore,
  nota,
  tono = 'neutro',
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  tono?: 'neutro' | 'buono';
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        tono === 'buono' ? 'border-green-200 bg-green-50' : 'border-neutral-200 bg-white'
      }`}
    >
      <dt className="text-xs text-neutral-600">{etichetta}</dt>
      <dd className="tabellare mt-1 text-2xl font-black text-neutral-950">{valore}</dd>
      {nota && <p className="mt-1 text-xs leading-4 text-neutral-500">{nota}</p>}
    </div>
  );
}

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
          <strong>prezzo per litro o per chilo</strong>, non sul prezzo della confezione: dodici
          bottiglie a 9 euro e ventiquattro a 16 si ordinano al contrario a seconda di quale dei due
          si guarda.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Riquadro
          etichetta="Confronti possibili"
          valore={String(t.compared)}
          nota={`su ${t.products} prodotti con offerte`}
        />
        <Riquadro
          etichetta="Vale il cambio"
          valore={String(t.worthAlert)}
          nota={`oltre ${numero(report.thresholds.percentage, 1)}% e ${euro(report.thresholds.euro)}`}
          tono={t.worthAlert > 0 ? 'buono' : 'neutro'}
        />
        <Riquadro
          etichetta="Risparmio totale"
          valore={euro(t.savingPerPack)}
          nota="una confezione per prodotto"
          tono={Number(t.savingPerPack) > 0 ? 'buono' : 'neutro'}
        />
        <Riquadro
          etichetta="Un solo fornitore"
          valore={String(t.singleOffer)}
          nota="niente da confrontare"
        />
        <Riquadro
          etichetta="Prezzi fermi"
          valore={String(t.stale)}
          nota={`da oltre ${report.thresholds.staleMonths} mesi`}
        />
      </dl>

      <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" role="search">
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
