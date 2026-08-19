'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Dialog,
  Input,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@/components/ui';
import type { ProductApiBody } from '@/features/products/dto';
import { catenaSconti, etichettaBasis, euro } from '@/features/products/format';
import type {
  PriceVariationDTO,
  PriceWindowVariationDTO,
  ProductPriceHistoryGroup,
} from '@/features/prices/dto';
import { PriceHistoryChart } from './price-history-chart';

type HistoryItem = ProductPriceHistoryGroup['prices'][number];

interface FormState {
  priceList: string;
  discounts: string;
  vatRate: string;
  validFrom: string;
}

interface SaveResult {
  created: boolean;
}

const DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const BUSINESS_DAY_FORMAT = new Intl.DateTimeFormat('it-IT', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Rome',
});

function dateOnly(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

function todayForInput(): string {
  const parts = BUSINESS_DAY_FORMAT.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

function normalizeDecimal(value: string): string | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) return null;
  return normalized;
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function parseDiscounts(value: string): number[] | null {
  if (!value.trim()) return [];
  const parts = value.split(/[+;]/).map((part) => part.trim());
  if (parts.some((part) => part === '')) return null;

  const parsed = parts.map((part) => {
    const normalized = normalizeDecimal(part.replace(/%$/, ''));
    return normalized === null ? Number.NaN : Number(normalized);
  });
  return parsed.every((discount) => Number.isFinite(discount) && discount > 0 && discount < 100)
    ? parsed
    : null;
}

function initialForm(history: ProductPriceHistoryGroup): FormState {
  const current =
    history.prices.find((item) => item.id === history.currentPriceId) ??
    history.prices.find((item) => item.isCurrent) ??
    null;

  return {
    priceList: current?.priceList ?? '',
    discounts: current?.discounts.join(' + ') ?? '',
    vatRate: current ? (current.vatRate ?? '') : (history.offerVatRate ?? ''),
    validFrom: todayForInput(),
  };
}

function PriceVariation({
  variation,
  compact = false,
}: {
  variation: PriceVariationDTO | null;
  compact?: boolean;
}) {
  if (!variation) return <span className="text-neutral-400">—</span>;

  const absolute = Number(variation.absolute);
  const percent = Number(variation.percent);
  if (!Number.isFinite(absolute) || !Number.isFinite(percent)) return <span>—</span>;

  if (absolute === 0) {
    return <span className="font-semibold text-neutral-500">→ invariato</span>;
  }

  const increase = absolute > 0;
  const sign = increase ? '+' : '−';
  const percentText = Math.abs(percent).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <span className={increase ? 'text-aumento font-semibold' : 'text-diminuzione font-semibold'}>
      <span aria-hidden="true">{increase ? '↑' : '↓'} </span>
      <span className="sr-only">{increase ? 'Aumento' : 'Diminuzione'}: </span>
      {compact ? (
        <>
          {sign}
          {percentText}%
        </>
      ) : (
        <>
          {sign}
          {euro(Math.abs(absolute))} ({sign}
          {percentText}%)
        </>
      )}
    </span>
  );
}

function Variation({ item }: { item: HistoryItem }) {
  return <PriceVariation variation={item.annulled ? null : item.variation} />;
}

function WindowVariations({ windows }: { windows: PriceWindowVariationDTO[] }) {
  return (
    <dl aria-label="Variazioni del prezzo netto nel tempo" className="grid grid-cols-3 gap-2">
      {windows.map((window) => {
        const hasData =
          window.basePrice !== null && window.currentPrice !== null && window.variation !== null;

        return (
          <div key={window.days} className="rounded-xl border border-neutral-200 bg-white p-3">
            <dt className="text-xs font-semibold text-neutral-500">{window.days} giorni</dt>
            <dd className="mt-1 tabular-nums">
              {hasData ? (
                <PriceVariation variation={window.variation} compact />
              ) : (
                <span className="text-sm font-semibold text-neutral-400">nessun dato</span>
              )}
              {hasData && (
                <span className="mt-1 block text-[11px] leading-4 text-neutral-500">
                  da {euro(window.basePrice!)} a {euro(window.currentPrice!)}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function PriceEntryDialog({
  history,
  endpoint,
}: {
  history: ProductPriceHistoryGroup;
  endpoint: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const formId = useId();
  const firstInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState<FormState>(() => initialForm(history));

  function show() {
    setForm(initialForm(history));
    setFields({});
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const errors: Record<string, string[]> = {};
    const priceList = normalizeDecimal(form.priceList);
    if (priceList === null || Number(priceList) <= 0) {
      errors.priceList = ['Inserisci un prezzo maggiore di zero (es. 9,50).'];
    }

    const discounts = parseDiscounts(form.discounts);
    if (discounts === null) {
      errors.discounts = ['Usa percentuali tra 0 e 100 separate da + (es. 5 + 10).'];
    }

    const vatRate = form.vatRate.trim() ? normalizeDecimal(form.vatRate) : null;
    if (form.vatRate.trim() && (vatRate === null || Number(vatRate) > 100)) {
      errors.vatRate = ['Inserisci un’aliquota tra 0 e 100.'];
    }

    if (!isValidDateOnly(form.validFrom)) {
      errors.validFrom = ['Scegli una data valida.'];
    }

    if (Object.keys(errors).length > 0 || priceList === null || discounts === null) {
      setFields(errors);
      toast({ title: 'Verificare i campi evidenziati', tone: 'error' });
      return;
    }

    setSaving(true);
    setFields({});
    try {
      const response = await fetch(
        `${endpoint}/${encodeURIComponent(history.supplierProductId)}/prices`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ priceList, discounts, vatRate, validFrom: form.validFrom }),
        },
      );
      const body = (await response.json().catch(() => null)) as ProductApiBody<SaveResult> | null;

      if (!response.ok || !body?.ok) {
        if (body && !body.ok && body.fields) setFields(body.fields);
        toast({
          title: 'Prezzo non salvato',
          description: body && !body.ok ? body.error : 'Il server non ha risposto correttamente.',
          tone: 'error',
        });
        return;
      }

      setOpen(false);
      toast(
        body.data.created
          ? {
              title: 'Prezzo registrato',
              description: `Valido dal ${dateOnly(form.validFrom)}.`,
              tone: 'success',
            }
          : {
              title: 'Prezzo già presente',
              description: 'Lo storico non è stato duplicato.',
              tone: 'info',
            },
      );
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={show}>
        Registra prezzo
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Nuovo prezzo · ${history.supplierName}`}
        description={history.rawName}
        closeOnBackdrop={!saving}
        closeDisabled={saving}
        initialFocusRef={firstInput}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Annulla
            </Button>
            <Button type="submit" form={formId} loading={saving} loadingLabel="Salvataggio prezzo">
              Salva nello storico
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={save} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              ref={firstInput}
              name={`${formId}-priceList`}
              label="Prezzo di listino"
              required
              inputMode="decimal"
              autoComplete="off"
              value={form.priceList}
              onChange={(event) =>
                setForm((current) => ({ ...current, priceList: event.target.value }))
              }
              error={fields.priceList?.[0]}
              hint="In euro, come riportato dal fornitore al lordo degli sconti. Es. 9,50"
            />
            <Input
              name={`${formId}-validFrom`}
              label="Valido dal"
              required
              type="date"
              max={todayForInput()}
              value={form.validFrom}
              onChange={(event) =>
                setForm((current) => ({ ...current, validFrom: event.target.value }))
              }
              error={fields.validFrom?.[0]}
            />
          </div>

          <Input
            name={`${formId}-discounts`}
            label="Sconti successivi"
            inputMode="decimal"
            autoComplete="off"
            value={form.discounts}
            onChange={(event) =>
              setForm((current) => ({ ...current, discounts: event.target.value }))
            }
            error={fields.discounts?.[0]}
            hint="Facoltativi. Separare con «+», es. 5 + 10. Il netto viene calcolato automaticamente."
          />

          <Input
            name={`${formId}-vatRate`}
            label="Aliquota IVA"
            inputMode="decimal"
            autoComplete="off"
            value={form.vatRate}
            onChange={(event) =>
              setForm((current) => ({ ...current, vatRate: event.target.value }))
            }
            error={fields.vatRate?.[0]}
            hint="Facoltativa. Indicare il solo valore numerico, es. 10."
          />

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
            Se esiste già un prezzo con la stessa data, questo viene registrato come correzione: la
            riga precedente resta visibile come “sostituita”.
          </p>
          {fields._form?.[0] && (
            <p className="text-aumento text-sm" role="alert">
              {fields._form[0]}
            </p>
          )}
        </form>
      </Dialog>
    </>
  );
}

function HistoryCard({
  history,
  endpoint,
}: {
  history: ProductPriceHistoryGroup;
  endpoint: string;
}) {
  const current =
    history.prices.find((item) => item.id === history.currentPriceId) ??
    history.prices.find((item) => item.isCurrent) ??
    null;
  const ordered = [...history.prices].sort(
    (a, b) => b.validFrom.localeCompare(a.validFrom) || b.createdAt.localeCompare(a.createdAt),
  );
  const effectiveCount = history.prices.filter((item) => !item.annulled).length;
  const correctedCount = history.prices.length - effectiveCount;

  return (
    <article
      id={`storico-prezzi-${history.supplierProductId}`}
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
    >
      <header className="flex flex-col justify-between gap-4 border-b border-neutral-200 p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-neutral-950">{history.supplierName}</h3>
            {history.supplierCode && <Badge variant="neutral">{history.supplierCode}</Badge>}
          </div>
          <p className="mt-1 truncate text-sm text-neutral-500" title={history.rawName}>
            {history.rawName}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {effectiveCount} {effectiveCount === 1 ? 'prezzo effettivo' : 'prezzi effettivi'}
            {correctedCount > 0 &&
              ` · ${correctedCount} ${correctedCount === 1 ? 'correzione' : 'correzioni'}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
          <div className="text-left sm:text-right">
            <p className="text-xs text-neutral-500">Netto corrente</p>
            <p className="tabellare text-lg font-extrabold text-neutral-950">
              {current ? euro(current.priceNet) : '—'}
            </p>
          </div>
          <PriceEntryDialog history={history} endpoint={endpoint} />
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        <WindowVariations windows={history.windowVariations} />

        {effectiveCount > 0 ? (
          <PriceHistoryChart entries={history.prices} supplierName={history.supplierName} />
        ) : (
          <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-7 text-center text-sm text-neutral-500">
            Nessun prezzo registrato. Inserire il primo per avviare lo storico.
          </p>
        )}

        <Table scrollLabel={`Storico prezzi di ${history.supplierName}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Valido dal</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead numeric>Listino</TableHead>
              <TableHead>Sconti</TableHead>
              <TableHead numeric>Netto</TableHead>
              {/* «a listino», e non è un dettaglio: nella tabella delle
                  offerte qui sopra il €/L contiene il rimborso concordato,
                  perché lì serve a confrontare i fornitori. Qui no — lo
                  storico è il registro di cosa è stato pattuito quel giorno,
                  e applicarci lo sconto di oggi riscriverebbe il passato con
                  un accordo che allora poteva non esistere. Due numeri
                  diversi vanno bene; due numeri diversi con la stessa
                  etichetta no. */}
              <TableHead
                numeric
                title="Sul prezzo di listino: lo storico registra il valore pattuito, non il rimborso corrente"
              >
                Per unità a listino
              </TableHead>
              <TableHead>Variazione</TableHead>
              <TableHead>Origine</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.length === 0 ? (
              <TableEmpty colSpan={8}>Nessun prezzo nello storico.</TableEmpty>
            ) : (
              ordered.map((item) => (
                <TableRow
                  key={item.id}
                  className={item.annulled ? 'bg-neutral-50 opacity-65' : undefined}
                >
                  <TableCell className="whitespace-nowrap">
                    <span className={item.annulled ? 'line-through' : undefined}>
                      {dateOnly(item.validFrom)}
                    </span>
                    {item.validTo && !item.annulled && (
                      <span className="mt-0.5 block text-xs text-neutral-400">
                        cambio {dateOnly(item.validTo)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.annulled ? (
                      <Badge variant="neutral">sostituito</Badge>
                    ) : item.isCurrent || item.id === history.currentPriceId ? (
                      <Badge variant="success" dot>
                        corrente
                      </Badge>
                    ) : (
                      <Badge variant="neutral">storico</Badge>
                    )}
                  </TableCell>
                  <TableCell numeric>{euro(item.priceList)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {catenaSconti(item.discounts)}
                  </TableCell>
                  <TableCell numeric className="font-semibold text-neutral-950">
                    {euro(item.priceNet)}
                  </TableCell>
                  <TableCell numeric>
                    {history.packQuantityConfirmed ? (
                      <>
                        {euro(item.unitPrice, 4)}{' '}
                        <span className="text-xs text-neutral-500">
                          {etichettaBasis(item.unitPriceBasis).slice(1)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-500">confezione da definire</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Variation item={item} />
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {item.source === 'MANUAL'
                      ? 'Manuale'
                      : item.source === 'PRICE_LIST'
                        ? 'Listino'
                        : 'Ordine'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </article>
  );
}

export function ProductPriceHistory({
  histories,
  endpoint,
}: {
  histories: ProductPriceHistoryGroup[];
  endpoint: string;
}) {
  if (histories.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
        Associare almeno un’offerta al prodotto per registrarne i prezzi.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {histories.map((history) => (
        <HistoryCard key={history.supplierProductId} history={history} endpoint={endpoint} />
      ))}
    </div>
  );
}
