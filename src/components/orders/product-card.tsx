'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { FotoProdotto } from '@/components/products/foto-prodotto';
import { ColloBadge } from '@/components/products/collo-badge';
import type { OffertaOrdinabile, RisultatoOrdinabile } from '@/features/orders/dto';
import { CONFEZIONI_MAX, CONFEZIONI_MIN } from '@/features/orders/schema';
import { euro, formatoConfezione } from '@/features/products/format';

/**
 * Un prodotto da ordinare, come card.
 *
 * ── Cosa c'è e cosa è stato tolto ───────────────────────────────────────
 * Solo ciò che serve a decidere se metterlo nell'ordine: **foto, nome,
 * formato, fornitore, prezzo, e il bottone**. Tutto il resto — codici,
 * aliquote, date — sta nella scheda prodotto, dove si va quando ci si sta
 * facendo una domanda, non mentre si compila un ordine.
 *
 * La gerarchia è pensata per chi scorre col pollice e non legge: la foto
 * dice *cosa* è, il prezzo grande dice *quanto*, il bottone verde dice
 * *dove premere*. Nome e fornitore si leggono solo se i primi tre non sono
 * bastati.
 *
 * ── Perché il prezzo è il secondo elemento per grandezza ────────────────
 * Perché è la ragione per cui questa app esiste: confrontare i fornitori. Un
 * prezzo scritto piccolo accanto al nome obbligherebbe a fermarsi su ogni
 * riga per leggerlo, e chi ordina cinquanta prodotti non si ferma.
 */

/** Il comando quantità, quando il prodotto è già dentro. */
function Quantita({
  nome,
  quantita,
  onCambia,
  onTogli,
}: {
  nome: string;
  quantita: number;
  onCambia: (q: number) => void;
  onTogli: () => void;
}) {
  // `null` mentre non si sta scrivendo: così il campo segue le modifiche che
  // arrivano da altrove — il «+», o l'ordine ricaricato — invece di restare
  // fermo su quello che c'era all'apertura della pagina.
  const [bozza, setBozza] = useState<string | null>(null);

  function conferma() {
    if (bozza === null) return;
    const richiesta = Number(bozza);
    setBozza(null);
    // Un campo svuotato non vuol dire zero: vuol dire che ci si è ripensati.
    if (!bozza.trim() || !Number.isFinite(richiesta)) return;
    if (richiesta < CONFEZIONI_MIN) {
      onTogli();
      return;
    }
    const limitata = Math.min(richiesta, CONFEZIONI_MAX);
    if (limitata !== quantita) onCambia(limitata);
  }

  const meno = quantita <= CONFEZIONI_MIN;

  return (
    <span className="border-brand-600 bg-brand-50 flex items-center rounded-xl border-2">
      <button
        type="button"
        onClick={() => (meno ? onTogli() : onCambia(quantita - 1))}
        aria-label={meno ? `Togli ${nome} dall’ordine` : 'Una confezione in meno'}
        className="text-brand-800 hover:bg-brand-100 active:bg-brand-200 grid h-12 w-11 cursor-pointer place-items-center rounded-l-lg transition-colors"
      >
        <span aria-hidden className="text-xl leading-none font-bold">
          {meno ? '×' : '−'}
        </span>
      </button>
      {/* Il numero si scrive.
          Cinquanta casse d'acqua a colpi di «+» sono cinquanta pressioni, e
          chi ordina lo fa una volta e poi torna al foglio di carta. */}
      <input
        type="text"
        inputMode="numeric"
        value={bozza ?? String(quantita)}
        onChange={(e) => setBozza(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => conferma()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setBozza(null);
            e.currentTarget.blur();
          }
        }}
        aria-label={`Confezioni di ${nome}`}
        className="tabellare focus:bg-brand-100 w-11 cursor-text bg-transparent text-center font-black text-neutral-950 outline-none"
      />
      <button
        type="button"
        onClick={() => onCambia(Math.min(quantita + 1, CONFEZIONI_MAX))}
        aria-label="Una confezione in più"
        className="text-brand-800 hover:bg-brand-100 active:bg-brand-200 grid h-12 w-11 cursor-pointer place-items-center rounded-r-lg transition-colors"
      >
        <span aria-hidden className="text-xl leading-none font-bold">
          +
        </span>
      </button>
    </span>
  );
}

function Aggiungi({ etichetta, onClick }: { etichetta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etichetta}
      className="bg-brand-600 hover:bg-brand-700 active:bg-brand-900 focus-visible:ring-brand-600 grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-xl text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <span aria-hidden className="text-2xl leading-none font-bold">
        +
      </span>
    </button>
  );
}

/** Prezzo, sconto e badge: il blocco che si legge per decidere. */
function Prezzo({ offerta, grande }: { offerta: OffertaOrdinabile; grande: boolean }) {
  const sconto = Number(offerta.scontoExtraPct) > 0;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={`tabellare leading-none font-black text-neutral-950 ${
          grande ? 'text-xl' : 'text-base'
        }`}
      >
        {euro(offerta.priceNet)}
      </span>
      {/* Il prezzo per unità solo se la confezione è dichiarata: altrimenti
          sarebbe diviso per un numero inventato e sembrerebbe un dato vero. */}
      {offerta.unitPrice && offerta.packQuantityConfirmed && (
        <span className="tabellare text-xs text-neutral-400">
          {euro(offerta.unitPrice)}/{offerta.unitPriceBasis === 'PER_KG' ? 'kg' : 'L'}
        </span>
      )}
      {sconto && (
        <span
          className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-violet-800"
          title={`Sconto concordato: paghi ${euro(offerta.priceNet)} e ti tornano indietro ${euro(
            Number(offerta.priceNet) - Number(offerta.prezzoEffettivo),
          )}`}
        >
          −{offerta.scontoExtraPct}% → {euro(offerta.prezzoEffettivo)}
        </span>
      )}
    </div>
  );
}

export function ProductCard({
  risultato,
  attiva,
  perOfferta,
  onSeleziona,
  onAggiungi,
  onCambiaQuantita,
  onRimuovi,
}: {
  risultato: RisultatoOrdinabile;
  attiva: boolean;
  perOfferta: Map<string, { rigaId: string; quantita: number }>;
  onSeleziona: () => void;
  onAggiungi: (supplierProductId: string) => void;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  onRimuovi: (rigaId: string) => void;
}) {
  const prima = risultato.offerte[0];
  const altre = risultato.offerte.slice(1);
  // Le card con più fornitori nascono **chiuse**: con nove fornitori e
  // cinquecento prodotti un elenco in cui un terzo delle voci è alto il
  // triplo delle altre non si scorre. Il confronto non si perde — davanti
  // c'è già il più conveniente col suo prezzo, e accanto quanti altri ce
  // l'hanno.
  const [aperto, setAperto] = useState(false);
  const elemento = useRef<HTMLLIElement>(null);
  const gia = prima ? perOfferta.get(prima.supplierProductId) : undefined;

  useEffect(() => {
    if (attiva) elemento.current?.scrollIntoView({ block: 'nearest' });
  }, [attiva]);

  return (
    <li
      ref={elemento}
      onMouseEnter={onSeleziona}
      className={`rounded-2xl border bg-white transition-colors ${
        gia
          ? 'border-brand-500 bg-brand-50/40'
          : attiva
            ? 'border-neutral-300'
            : 'border-neutral-200'
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <FotoProdotto
          src={risultato.imageUrl}
          nome={risultato.name}
          categoria={risultato.category?.name}
          className="h-[4.5rem] w-14 sm:h-24 sm:w-[4.5rem]"
        />

        <div className="min-w-0 flex-1">
          {risultato.category && (
            <p className="text-[11px] font-bold tracking-wide text-violet-700 uppercase">
              {risultato.category.name}
            </p>
          )}
          <p className="mt-0.5 line-clamp-2 leading-5 font-bold text-neutral-950">
            {risultato.name}
          </p>

          {prima ? (
            <>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                <ColloBadge confezione={prima} />
                <span className="truncate">{prima.supplierName}</span>
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {prima.migliore && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-1.5 py-0.5 text-[11px] font-bold text-green-800">
                    <span aria-hidden>★</span> conviene
                  </span>
                )}
                {prima.stale && (
                  <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                    prezzo fermo
                  </span>
                )}
                {altre.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAperto((v) => !v)}
                    aria-expanded={aperto}
                    aria-label={
                      aperto
                        ? `Nascondi gli altri fornitori di ${risultato.name}`
                        : `Mostra gli altri ${altre.length} fornitori di ${risultato.name}`
                    }
                    className="text-brand-700 hover:bg-brand-50 -my-1 inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-xs font-semibold transition-colors"
                  >
                    {/* Il numero, non una freccia muta: da chiusa la card deve
                        dire che sotto c'è un confronto, o nessuno la apre. */}
                    <span aria-hidden>+{altre.length} fornitori</span>
                    <AppIcon
                      name="chevron"
                      className={`h-3.5 w-3.5 transition-transform ${aperto ? 'rotate-90' : ''}`}
                    />
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="text-neutral-500">
                {formatoConfezione(risultato.unitSize, risultato.unitOfMeasure, 1)}
              </span>
              <span className="text-amber-700">{risultato.nonOrdinabile}</span>
            </p>
          )}
        </div>

        {prima && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Prezzo offerta={prima} grande />
            {gia ? (
              <Quantita
                nome={risultato.name}
                quantita={gia.quantita}
                onCambia={(q) => onCambiaQuantita(gia.rigaId, q)}
                onTogli={() => onRimuovi(gia.rigaId)}
              />
            ) : (
              <Aggiungi
                etichetta={`Aggiungi ${risultato.name} all’ordine`}
                onClick={() => onAggiungi(prima.supplierProductId)}
              />
            )}
          </div>
        )}
      </div>

      {aperto && altre.length > 0 && (
        <div className="border-t border-neutral-200">
          {/* Perché guardare le alternative: senza questa riga sono solo altri
              numeri, e restano lì senza far decidere niente. */}
          {risultato.confrontato && risultato.risparmioPerConfezione && (
            <p className="bg-green-50/70 px-3 py-1.5 text-xs text-green-900">
              Conviene da <strong>{prima!.supplierName}</strong>:{' '}
              <strong>{euro(risultato.risparmioPerConfezione)}</strong> in meno a confezione.
            </p>
          )}
          <ul className="divide-y divide-neutral-100">
            {altre.map((offerta) => {
              const suo = perOfferta.get(offerta.supplierProductId);
              return (
                <li
                  key={offerta.supplierProductId}
                  className="flex items-center gap-3 px-3 py-2 pl-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-800">
                      {offerta.supplierName}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {formatoConfezione(
                        offerta.unitSize,
                        offerta.unitOfMeasure,
                        offerta.packQuantity,
                      )}
                    </span>
                  </span>
                  <Prezzo offerta={offerta} grande={false} />
                  {suo ? (
                    <Quantita
                      nome={`${risultato.name} da ${offerta.supplierName}`}
                      quantita={suo.quantita}
                      onCambia={(q) => onCambiaQuantita(suo.rigaId, q)}
                      onTogli={() => onRimuovi(suo.rigaId)}
                    />
                  ) : (
                    <Aggiungi
                      etichetta={`Aggiungi ${risultato.name} da ${offerta.supplierName}`}
                      onClick={() => onAggiungi(offerta.supplierProductId)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}
