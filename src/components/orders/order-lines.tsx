'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppIcon } from '@/components/app-icon';
import { useToast } from '@/components/ui';
import type { OrderApiBody, OrdineStorico, RisultatoOrdinabile } from '@/features/orders/dto';
import { euro, formatoConfezione, nomeLeggibile } from '@/features/products/format';

/**
 * Le righe di un ordine confermato, con il comando «non ce l'ha».
 *
 * ── Perché sta su un ordine congelato ───────────────────────────────────
 * L'ordine non si modifica più, ed è giusto: prezzi e descrizioni sono
 * l'accordo. Ma fra l'ordine e la consegna succede una cosa che non è una
 * modifica dell'accordo — il fornitore arriva e dice che un articolo non ce
 * l'ha. Quella merce non arriva e non si paga, e il documento che gli si
 * rimanda non deve più contenerla.
 *
 * La riga **non sparisce**: resta sbarrata, col suo prezzo. Cancellarla
 * toglierebbe dallo storico il fatto che era stata ordinata — che è proprio
 * la cosa da ricordare quando si ricontrolla la fattura o si decide se
 * cambiare fornitore.
 */
export function OrderLines({
  ordine: iniziale,
  endpointOrdini,
  modificabile,
}: {
  ordine: OrdineStorico;
  endpointOrdini: string;
  /** `false` su un ordine annullato: non c'è più niente da consegnare. */
  modificabile: boolean;
}) {
  const [ordine, setOrdine] = useState(iniziale);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [cerca, setCerca] = useState('');
  const [trovati, setTrovati] = useState<RisultatoOrdinabile[]>([]);
  const [cercando, setCercando] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  /** Una mutazione qualunque sull'ordine: stessa gestione dell'esito. */
  async function muta(chiave: string, url: string, init: RequestInit) {
    if (inCorso) return;
    setInCorso(chiave);
    try {
      const risposta = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      const corpo = (await risposta.json()) as OrderApiBody<OrdineStorico>;
      if (!corpo.ok) {
        toast({ title: 'Modifica non riuscita', description: corpo.error, tone: 'error' });
        return;
      }
      setOrdine(corpo.data);
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setInCorso(null);
    }
  }

  async function cercaProdotti(q: string) {
    setCerca(q);
    if (q.trim().length < 2) {
      setTrovati([]);
      return;
    }
    setCercando(true);
    try {
      const url = new URL(`${endpointOrdini}/current/search`, window.location.origin);
      url.searchParams.set('q', q.trim());
      url.searchParams.set('limite', '8');
      const corpo = (await (
        await fetch(url, { headers: { Accept: 'application/json' } })
      ).json()) as OrderApiBody<RisultatoOrdinabile[]>;
      if (corpo.ok) setTrovati(corpo.data);
    } catch {
      setTrovati([]);
    } finally {
      setCercando(false);
    }
  }

  async function segna(lineId: string, disponibile: boolean) {
    if (inCorso) return;
    setInCorso(lineId);
    try {
      const risposta = await fetch(`${endpointOrdini}/${ordine.id}/lines/${lineId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ disponibile }),
      });
      const corpo = (await risposta.json()) as OrderApiBody<OrdineStorico>;
      if (!corpo.ok) {
        toast({
          title: 'Non è stato possibile aggiornare la riga',
          description: corpo.error,
          tone: 'error',
        });
        return;
      }
      setOrdine(corpo.data);
      // I documenti già generati contengono ancora la riga: la pagina si
      // ricarica perché l'avviso «rigenera» compaia senza doverla riaprire.
      router.refresh();
    } catch {
      toast({ title: 'Server non raggiungibile', tone: 'error' });
    } finally {
      setInCorso(null);
    }
  }

  return (
    <>
      {ordine.righeNonDisponibili > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <AppIcon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              {ordine.righeNonDisponibili}{' '}
              {ordine.righeNonDisponibili === 1 ? 'riga esclusa' : 'righe escluse'}
            </strong>{' '}
            per indisponibilità dichiarata dal fornitore. I totali riportati di seguito le escludono
            già. I documenti generati in precedenza le contengono ancora:{' '}
            <strong>rigenerarli</strong> prima dell’invio.
          </span>
        </p>
      )}

      {ordine.perFornitore.map((gruppo) => (
        <section
          key={gruppo.supplierId}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-3">
            <h2 className="font-black text-neutral-950">{gruppo.supplierName}</h2>
            <p className="tabellare text-sm text-neutral-600">
              {gruppo.righe.filter((r) => !r.nonDisponibile).length} righe ·{' '}
              <strong className="text-neutral-950">{euro(gruppo.netto)}</strong>
            </p>
          </header>
          <ul className="divide-y divide-neutral-100">
            {gruppo.righe.map((riga) => (
              <li
                key={riga.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 ${
                  riga.nonDisponibile ? 'bg-neutral-50' : ''
                }`}
              >
                {modificabile && !riga.nonDisponibile ? (
                  // La quantità si corregge qui: fra la conferma e la
                  // consegna ci si accorge che due casse erano tre, e finora
                  // l'unica via era un secondo ordine per una riga sola.
                  // Zero la toglie — è una nostra correzione, non una
                  // mancata consegna, che ha il suo comando apposta.
                  <input
                    type="text"
                    inputMode="numeric"
                    defaultValue={String(riga.quantityPacks)}
                    onBlur={(e) => {
                      const q = Number(e.target.value.replace(/[^0-9]/g, ''));
                      if (!Number.isFinite(q) || q === riga.quantityPacks) {
                        e.target.value = String(riga.quantityPacks);
                        return;
                      }
                      void muta(riga.id, `${endpointOrdini}/${ordine.id}/lines/${riga.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ quantityPacks: q }),
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    aria-label={`Confezioni di ${riga.name}`}
                    className="tabellare focus:border-brand-500 w-11 shrink-0 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-bold text-neutral-950 hover:border-neutral-300 focus:bg-white focus:outline-none"
                  />
                ) : (
                  <span
                    className={`tabellare w-11 shrink-0 text-center font-bold ${
                      riga.nonDisponibile ? 'text-neutral-400' : 'text-neutral-950'
                    }`}
                  >
                    {riga.quantityPacks}×
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={`text-sm font-semibold ${
                      riga.nonDisponibile ? 'text-neutral-400 line-through' : 'text-neutral-950'
                    }`}
                  >
                    {nomeLeggibile(riga.name)}
                  </span>
                  <span className="ml-2 text-xs text-neutral-500">
                    {formatoConfezione(riga.unitSize, riga.unitOfMeasure, riga.packQuantity)}
                    {riga.supplierCode && ` · cod. ${riga.supplierCode}`}
                  </span>
                  {riga.nonDisponibile && (
                    <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-amber-800">
                      non consegnato
                    </span>
                  )}
                  {riga.note && (
                    <span className="mt-0.5 block text-xs text-neutral-500">{riga.note}</span>
                  )}
                </span>

                <span
                  className={`tabellare text-xs ${
                    riga.nonDisponibile ? 'text-neutral-300' : 'text-neutral-500'
                  }`}
                >
                  {euro(riga.priceNet)}
                </span>
                <span
                  className={`tabellare w-20 text-right text-sm font-bold ${
                    riga.nonDisponibile ? 'text-neutral-400 line-through' : 'text-neutral-950'
                  }`}
                >
                  {euro(riga.lineTotalNet)}
                </span>

                {modificabile && (
                  <button
                    type="button"
                    onClick={() => void segna(riga.id, riga.nonDisponibile)}
                    disabled={inCorso !== null}
                    aria-label={
                      riga.nonDisponibile
                        ? `Ripristina ${riga.name} nell’ordine`
                        : `Segnala ${riga.name} come non consegnato`
                    }
                    className={`min-h-9 shrink-0 cursor-pointer rounded-lg border px-2.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      riga.nonDisponibile
                        ? 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400'
                        : 'border-neutral-200 bg-white text-neutral-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800'
                    }`}
                  >
                    {inCorso === riga.id
                      ? '…'
                      : riga.nonDisponibile
                        ? 'Ripristina'
                        : 'Non disponibile'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {modificabile && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="font-bold text-neutral-950">Aggiungi un articolo</h3>
          <p className="mt-1 mb-3 text-sm leading-5 text-neutral-500">
            L’articolo viene aggiunto a questo ordine, che mantiene lo stesso numero: al fornitore
            resta un unico documento. Il prezzo applicato è quello corrente a listino.
          </p>
          <input
            type="text"
            value={cerca}
            onChange={(e) => void cercaProdotti(e.target.value)}
            placeholder="Cerca un articolo a catalogo…"
            aria-label="Cerca un prodotto da aggiungere all’ordine"
            className="focus:border-brand-500 focus:ring-brand-500/30 h-12 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:ring-4"
          />
          {cercando && <p className="mt-2 text-xs text-neutral-400">Ricerca in corso…</p>}
          {trovati.length > 0 && (
            <ul className="mt-2 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {trovati.map((r) => {
                const offerta = r.offerte[0];
                return (
                  <li key={r.productId} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-950">
                        {nomeLeggibile(r.name)}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {offerta
                          ? `${euro(offerta.priceNet)} · ${offerta.supplierName}`
                          : (r.nonOrdinabile ?? 'senza prezzo')}
                      </span>
                    </span>
                    {offerta && (
                      <button
                        type="button"
                        disabled={inCorso !== null}
                        onClick={() =>
                          void muta(r.productId, `${endpointOrdini}/${ordine.id}/lines`, {
                            method: 'POST',
                            body: JSON.stringify({
                              supplierProductId: offerta.supplierProductId,
                              quantityPacks: 1,
                            }),
                          }).then(() => {
                            setCerca('');
                            setTrovati([]);
                          })
                        }
                        aria-label={`Aggiungi ${r.name} all’ordine`}
                        className="bg-brand-600 hover:bg-brand-700 grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-white disabled:opacity-50"
                      >
                        <span aria-hidden className="text-xl leading-none">
                          +
                        </span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <dl className="space-y-1 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="font-semibold text-neutral-900">
              Totale <span className="font-normal text-neutral-500">+ IVA</span>
              {ordine.righeNonDisponibili > 0 && (
                <span className="ml-2 text-xs font-normal text-amber-700">
                  al netto delle righe non consegnate
                </span>
              )}
            </dt>
            <dd className="tabellare text-2xl font-black text-neutral-950">{euro(ordine.netto)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
