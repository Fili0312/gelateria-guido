import { useId } from 'react';
import { euro } from '@/features/products/format';
import { buildPriceChart, type PriceChartEntry } from './chart';

const DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function dateOnly(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

export function PriceHistoryChart({
  entries,
  supplierName,
}: {
  entries: readonly PriceChartEntry[];
  supplierName: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const model = buildPriceChart(entries);
  if (!model) return null;

  const first = model.points[0]!;
  const last = model.points.at(-1)!;
  const range = model.max - model.min;
  const ticks = range === 0 ? [model.max] : [model.max, model.min + range / 2, model.min];

  return (
    <figure className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 sm:p-4">
      <figcaption className="mb-2 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
        Andamento del prezzo netto
      </figcaption>
      <svg
        viewBox="0 0 720 220"
        className="h-auto w-full overflow-visible"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        {/*
          Un figlio solo, e una stringa gia' composta.
          `<title>` e' un elemento che React 19 tratta come metadato del
          documento, e con due figli — il testo fisso piu' `{supplierName}` —
          il server lo rendeva **vuoto**: il nome accessibile del grafico
          spariva dall'HTML e l'idratazione falliva, buttando via e
          ridisegnando l'intero sottoalbero sul client. Il fratello `<desc>`
          qui sotto non ne soffre proprio perche' ha gia' un figlio unico.
        */}
        <title id={titleId}>{`Storico del prezzo netto di ${supplierName}`}</title>
        <desc id={descriptionId}>
          {model.points.length === 1
            ? `Un prezzo: ${euro(first.value)} dal ${dateOnly(first.date)}.`
            : `${model.points.length} prezzi, da ${euro(first.value)} il ${dateOnly(first.date)} a ${euro(last.value)} il ${dateOnly(last.date)}.`}
        </desc>

        {ticks.map((tick) => {
          const y = range === 0 ? 110 : 24 + ((model.max - tick) / Math.max(range, 0.000001)) * 172;
          return (
            <g key={tick} aria-hidden="true">
              <line
                x1="48"
                x2="672"
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-neutral-200"
                strokeDasharray="4 5"
              />
              <text x="42" y={y + 4} textAnchor="end" className="fill-neutral-500 text-[11px]">
                {euro(tick)}
              </text>
            </g>
          );
        })}

        <path
          d={model.stepPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
          className="text-brand-600"
          vectorEffect="non-scaling-stroke"
          aria-hidden="true"
        />

        {model.points.map((point) => (
          <circle
            key={point.id}
            cx={point.x}
            cy={point.y}
            r="5"
            fill="currentColor"
            stroke="white"
            strokeWidth="2"
            className="text-brand-700"
            vectorEffect="non-scaling-stroke"
            aria-hidden="true"
          />
        ))}

        <g aria-hidden="true" className="fill-neutral-500 text-[11px]">
          <text x={first.x} y="216" textAnchor={model.points.length === 1 ? 'middle' : 'start'}>
            {dateOnly(first.date)}
          </text>
          {model.points.length > 1 && (
            <text x={last.x} y="216" textAnchor="end">
              {dateOnly(last.date)}
            </text>
          )}
        </g>
      </svg>
    </figure>
  );
}
