'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppIcon } from '@/components/app-icon';
import { useToast } from '@/components/ui';
import type { OrderApiBody, OrdineStorico } from '@/features/orders/dto';
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
  const { toast } = useToast();
  const router = useRouter();

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
            perché il fornitore non le aveva. I totali qui sotto sono già senza. I documenti
            generati prima le contengono ancora: <strong>rigenerali</strong> qui sotto prima di
            rimandarli.
          </span>
        </p>
      )}

      {ordine.perFornitore.map((gruppo) => (
        <section
          key={gruppo.supplierId}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
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
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 ${
                  riga.nonDisponibile ? 'bg-neutral-50' : ''
                }`}
              >
                <span
                  className={`tabellare w-10 shrink-0 font-bold ${
                    riga.nonDisponibile ? 'text-neutral-400' : 'text-neutral-950'
                  }`}
                >
                  {riga.quantityPacks}×
                </span>
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
                        ? `Rimetti ${riga.name} nell’ordine`
                        : `${riga.name}: il fornitore non l’ha consegnato`
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
                        ? 'Rimetti'
                        : 'Non disponibile'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <dl className="space-y-1 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="font-semibold text-neutral-900">
              Totale <span className="font-normal text-neutral-500">+ IVA</span>
              {ordine.righeNonDisponibili > 0 && (
                <span className="ml-2 text-xs font-normal text-amber-700">
                  senza le righe non consegnate
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
