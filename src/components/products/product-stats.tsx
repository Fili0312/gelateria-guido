'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui';
import type { ProductApiBody } from '@/features/products/dto';
import { etichettaBase, euro, numero } from '@/features/products/format';
import {
  PRODUCT_STATS_PERIODS,
  productStatsChartBucketKey,
  type ProductPurchasePoint,
  type ProductPurchaseStats,
  type ProductStatsPeriod,
} from '@/features/products/stats';

const DATE = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Rome',
});

function date(value: string): string {
  return DATE.format(new Date(value));
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <dt className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</dt>
      <dd className="tabellare mt-1 text-2xl font-black text-neutral-950">{value}</dd>
      {note && <p className="mt-1 text-xs leading-5 text-neutral-500">{note}</p>}
    </div>
  );
}

interface ChartPoint {
  key: string;
  label: string;
  netSpend: number;
  packages: number;
  averagePaid: number;
}

/** Il grafico resta leggibile: giorni sui 30, mesi sulle finestre lunghe. */
function chartPoints(stats: ProductPurchaseStats): ChartPoint[] {
  const groups = new Map<string, ChartPoint>();
  for (const purchase of stats.purchases) {
    const instant = new Date(purchase.confirmedAt);
    const key = productStatsChartBucketKey(instant, stats.periodDays);
    const label =
      stats.periodDays === 30
        ? instant.toLocaleDateString('it-IT', {
            day: 'numeric',
            month: 'short',
            timeZone: 'Europe/Rome',
          })
        : instant.toLocaleDateString('it-IT', {
            month: 'short',
            year: '2-digit',
            timeZone: 'Europe/Rome',
          });
    const current = groups.get(key) ?? {
      key,
      label,
      netSpend: 0,
      packages: 0,
      averagePaid: 0,
    };
    current.netSpend += Number(purchase.netSpend);
    current.packages += purchase.packages;
    current.averagePaid = current.packages > 0 ? current.netSpend / current.packages : 0;
    groups.set(key, current);
  }
  return [...groups.values()];
}

function PurchaseChart({ stats }: { stats: ProductPurchaseStats }) {
  const points = chartPoints(stats);
  if (points.length === 0) return null;

  const width = 720;
  const height = 220;
  const left = 54;
  const right = 666;
  const top = 22;
  const bottom = 174;
  const usableWidth = right - left;
  const usableHeight = bottom - top;
  const maxSpend = Math.max(...points.map((point) => point.netSpend), 1);
  const prices = points.map((point) => point.averagePaid);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = Math.max(maxPrice - minPrice, 0.000001);
  const step = usableWidth / Math.max(points.length, 1);
  const barWidth = Math.max(Math.min(step * 0.56, 36), 2);
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const x = (index: number) => left + step * index + step / 2;
  const yPrice = (value: number) => top + ((maxPrice - value) / priceRange) * usableHeight;
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${yPrice(point.averagePaid)}`)
    .join(' ');
  const label = `Spesa e prezzo medio pagato nel periodo: ${points.length} ${points.length === 1 ? 'intervallo' : 'intervalli'}, spesa totale ${euro(stats.netSpend)}.`;

  return (
    <figure className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
        <span>Spesa e prezzo pagato nel tempo</span>
        <span className="flex items-center gap-3 font-normal normal-case">
          <span className="before:bg-brand-300 before:mr-1 before:inline-block before:h-2 before:w-3">
            spesa
          </span>
          <span className="before:mr-1 before:inline-block before:h-0.5 before:w-3 before:bg-violet-600 before:align-middle">
            media/conf.
          </span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={label}
      >
        <line x1={left} x2={right} y1={bottom} y2={bottom} className="stroke-neutral-200" />
        {points.map((point, index) => {
          const barHeight = (point.netSpend / maxSpend) * usableHeight;
          return (
            <g key={point.key} aria-hidden="true">
              <rect
                x={x(index) - barWidth / 2}
                y={bottom - barHeight}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                rx="3"
                className="fill-brand-300"
              />
              {(index % labelEvery === 0 || index === points.length - 1) && (
                <text
                  x={x(index)}
                  y="199"
                  textAnchor="middle"
                  className="fill-neutral-500 text-[10px]"
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
          className="text-violet-600"
          vectorEffect="non-scaling-stroke"
          aria-hidden="true"
        />
        {points.map((point, index) => (
          <circle
            key={point.key}
            cx={x(index)}
            cy={yPrice(point.averagePaid)}
            r="4"
            fill="currentColor"
            stroke="white"
            strokeWidth="2"
            className="text-violet-700"
            vectorEffect="non-scaling-stroke"
            aria-hidden="true"
          />
        ))}
        <g aria-hidden="true" className="fill-neutral-500 text-[10px]">
          <text x="48" y={top + 4} textAnchor="end">
            {euro(maxSpend)}
          </text>
          <text x="48" y={bottom + 4} textAnchor="end">
            €0
          </text>
        </g>
      </svg>
      <p className="sr-only">
        I valori esatti del grafico sono disponibili nella tabella degli acquisti qui sotto.
      </p>
    </figure>
  );
}

function PurchaseTable({ purchases }: { purchases: readonly ProductPurchasePoint[] }) {
  const visible = [...purchases].reverse().slice(0, 50);
  return (
    <details className="rounded-xl border border-neutral-200 bg-white">
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-neutral-800">
        Acquisti nel periodo ({purchases.length})
      </summary>
      <div className="overflow-x-auto border-t border-neutral-100">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Ordini del prodotto nel periodo, dal più recente</caption>
          <thead className="bg-neutral-50 text-xs tracking-wide text-neutral-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">
                Ordine
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">
                Confezioni
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">
                Pezzi
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">
                Media
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">
                Spesa
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {visible.map((purchase) => (
              <tr key={purchase.orderId}>
                <td className="px-4 py-2">
                  <Link
                    href={`/ordini/${purchase.orderId}`}
                    className="font-semibold text-neutral-900 hover:underline"
                  >
                    {purchase.orderCode ?? 'Ordine'}
                  </Link>
                  <span className="ml-2 text-xs text-neutral-500">
                    {date(purchase.confirmedAt)}
                  </span>
                </td>
                <td className="tabellare px-4 py-2 text-right">{purchase.packages}</td>
                <td className="tabellare px-4 py-2 text-right">{purchase.pieces}</td>
                <td className="tabellare px-4 py-2 text-right">
                  {euro(purchase.weightedAveragePaid)}
                </td>
                <td className="tabellare px-4 py-2 text-right font-semibold">
                  {euro(purchase.netSpend)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {purchases.length > visible.length && (
          <p className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
            Sono mostrati i 50 ordini più recenti; i totali comprendono tutti gli acquisti del
            periodo.
          </p>
        )}
      </div>
    </details>
  );
}

function CurrentComparison({ stats }: { stats: ProductPurchaseStats }) {
  const current = stats.currentPrice;
  const comparison = stats.comparison;
  if (!current) {
    return (
      <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600">
        Nessun prezzo corrente confrontabile: la media pagata resta disponibile, ma non c’è un
        valore attuale affidabile a cui paragonarla.
      </p>
    );
  }

  if (!comparison) {
    return (
      <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600">
        Oggi la migliore offerta è <strong>{euro(current.pricePerPackage)}</strong> a confezione da{' '}
        {current.packQuantity} presso {current.supplierName}. Servono acquisti nel periodo per
        calcolare la variazione.
      </p>
    );
  }

  const change = Number(comparison.percentageChange);
  const tone = change > 0 ? 'text-red-700' : change < 0 ? 'text-green-700' : 'text-neutral-700';
  const sign = change > 0 ? '+' : '';
  const basis = comparison.basis === 'PACKAGE' ? 'a confezione' : 'per pezzo';

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950">
      <div className="flex flex-wrap items-center gap-2">
        <strong>Prezzo attuale: {euro(comparison.currentPrice)}</strong>
        <span>{basis}</span>
        <span className={`tabellare font-black ${tone}`}>
          {sign}
          {numero(comparison.percentageChange, 2)}%
        </span>
        {current.stale && <Badge variant="warning">prezzo fermo da tempo</Badge>}
      </div>
      <p className="text-xs text-violet-800">
        Migliore offerta corrente: {current.supplierName}; media pagata nello storico{' '}
        {euro(comparison.averagePaid)} {basis}.
        {comparison.basis === 'PIECE' &&
          ' Il confronto è per pezzo perché nel periodo compaiono confezioni di dimensioni diverse.'}
      </p>
    </div>
  );
}

function AnnualSavings({ stats }: { stats: ProductPurchaseStats }) {
  const estimate = stats.estimatedAnnualSavings;
  if (!estimate) {
    return (
      <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600">
        <strong>Risparmio annuo stimato non disponibile.</strong>{' '}
        {stats.estimatedAnnualSavingsReason}
      </p>
    );
  }

  const unit = etichettaBase(estimate.baseUnit);
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-950">
      <p>
        <span className="text-xs font-semibold tracking-wide text-green-700 uppercase">
          Risparmio annuo potenziale
        </span>{' '}
        <strong className="tabellare ml-1 text-xl">{euro(estimate.amount)}</strong>
      </p>
      <p className="mt-1 text-xs text-green-800">
        Se il consumo osservato ({numero(estimate.observedQuantity, 3)} {unit} in {stats.periodDays}{' '}
        giorni) restasse costante: {numero(estimate.annualizedQuantity, 3)} {unit}/anno, comprati
        sempre da {estimate.bestSupplierName} invece di {estimate.alternativeSupplierName}.
        Differenza corrente {euro(estimate.unitDifference, 4)}/{unit}. È una proiezione, non un
        risparmio già contabilizzato.
      </p>
    </div>
  );
}

export function ProductStats({
  initialStats,
  endpoint,
}: {
  initialStats: ProductPurchaseStats;
  endpoint: string;
}) {
  const [stats, setStats] = useState(initialStats);
  const [period, setPeriod] = useState<ProductStatsPeriod>(initialStats.periodDays);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  async function changePeriod(next: ProductStatsPeriod) {
    if (next === stats.periodDays) {
      setPeriod(next);
      return;
    }

    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setPeriod(next);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${endpoint}?period=${next}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const body = (await response
        .json()
        .catch(() => null)) as ProductApiBody<ProductPurchaseStats> | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body && !body.ok ? body.error : 'Risposta non valida dal server.');
      }
      setStats(body.data);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setPeriod(stats.periodDays);
      setError(cause instanceof Error ? cause.message : 'Non è stato possibile cambiare periodo.');
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <section id="statistiche-acquisti" className="scroll-mt-6 space-y-4" aria-busy={loading}>
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-lg font-black text-neutral-950">Statistiche acquisti</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Solo ordini confermati; prezzi, confezioni e quantità sono gli snapshot del momento
            dell’acquisto.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          Periodo
          <select
            value={period}
            onChange={(event) =>
              void changePeriod(Number(event.target.value) as ProductStatsPeriod)
            }
            className="focus-visible:ring-brand-600 min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:ring-2 focus-visible:outline-none"
          >
            {PRODUCT_STATS_PERIODS.map((days) => (
              <option key={days} value={days}>
                ultimi {days} giorni
              </option>
            ))}
          </select>
        </label>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {loading
          ? `Caricamento statistiche degli ultimi ${period} giorni.`
          : `Statistiche degli ultimi ${stats.periodDays} giorni caricate.`}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {stats.orderCount === 0 ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm leading-6 text-neutral-500">
            Nessun acquisto negli ultimi {stats.periodDays} giorni. Prova una finestra più lunga.
          </p>
          <CurrentComparison stats={stats} />
          <AnnualSavings stats={stats} />
        </div>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Confezioni" value={numero(stats.packages, 0)} />
            <Metric label="Pezzi" value={numero(stats.pieces, 0)} />
            <Metric label="Spesa netta" value={euro(stats.netSpend)} />
            <Metric
              label="Ordini"
              value={numero(stats.orderCount, 0)}
              note={
                stats.averageFrequencyDays
                  ? `uno ogni ${numero(stats.averageFrequencyDays, 1)} giorni in media`
                  : 'serve almeno un secondo ordine per la frequenza'
              }
            />
            <Metric label="Ultimo acquisto" value={date(stats.lastPurchasedAt!)} />
            <Metric
              label="Media pagata"
              value={euro(stats.weightedAveragePaid!)}
              note="spesa netta divisa per le confezioni acquistate"
            />
          </dl>
          <CurrentComparison stats={stats} />
          <AnnualSavings stats={stats} />
          <PurchaseChart stats={stats} />
          <PurchaseTable purchases={stats.purchases} />
        </>
      )}
    </section>
  );
}
