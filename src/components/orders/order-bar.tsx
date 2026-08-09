'use client';

import { Badge, Button, Stepper } from '@/components/ui';
import type { OrdineCorrente } from '@/features/orders/dto';
import { CONFEZIONI_MAX, CONFEZIONI_MIN } from '@/features/orders/schema';
import { etichettaBasis, euro, formatoConfezione } from '@/features/products/format';

/**
 * La barra dei totali, sempre in vista.
 *
 * Sta ferma in fondo allo schermo perché è la risposta alla domanda che si fa
 * di continuo mentre si ordina — «quanto sto spendendo?» — e cercarla in cima
 * alla pagina significherebbe perdere il punto in cui si era arrivati con la
 * ricerca.
 *
 * I numeri arrivano **dal server** dopo ogni modifica, non da una somma fatta
 * qui: due conti diversi sullo stesso ordine divergerebbero al primo
 * arrotondamento, e la barra direbbe una cifra e il riepilogo un'altra.
 */

function Riepilogo({
  ordine,
  onCambiaQuantita,
  onRimuovi,
}: {
  ordine: OrdineCorrente;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  onRimuovi: (rigaId: string) => void;
}) {
  if (ordine.righe.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-neutral-500">
        L’ordine è vuoto. Cerca un prodotto qui sopra e premi Aggiungi.
      </p>
    );
  }

  return (
    <div className="max-h-[55vh] overflow-y-auto">
      {ordine.perFornitore.map((gruppo) => (
        <section key={gruppo.supplierId}>
          <h3 className="sticky top-0 flex items-baseline justify-between gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-700">
            <span>{gruppo.supplierName}</span>
            <span className="tabellare font-normal text-neutral-500">
              {gruppo.righe} righe · {gruppo.confezioni} conf. · {euro(gruppo.netto)}
            </span>
          </h3>
          <ul>
            {ordine.righe
              .filter((r) => r.supplierId === gruppo.supplierId)
              .map((riga) => (
                <li
                  key={riga.id}
                  className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-950">{riga.name}</p>
                    <p className="tabellare mt-0.5 text-xs text-neutral-500">
                      {formatoConfezione(riga.unitSize, riga.unitOfMeasure, riga.packQuantity)} ·{' '}
                      {euro(riga.priceNet)} a confezione
                      {riga.unitPrice && riga.unitPriceBasis && (
                        <>
                          {' · '}
                          {`${euro(riga.unitPrice, 4)}${etichettaBasis(riga.unitPriceBasis).slice(1)}`}
                        </>
                      )}
                    </p>
                    {/* Perché si sta comprando dal più caro: senza questa
                        riga, un ordine riletto fra un mese non si sa
                        giustificare. */}
                    {riga.migliorAlternativa && (
                      <p className="mt-1 text-xs text-amber-700">
                        {riga.migliorAlternativa.supplierName} lo fa a{' '}
                        {euro(riga.migliorAlternativa.priceNet)}
                        {riga.migliorAlternativa.risparmioPerConfezione &&
                          ` — ${euro(riga.migliorAlternativa.risparmioPerConfezione)} in meno a confezione`}
                      </p>
                    )}
                  </div>

                  <Stepper
                    value={riga.quantityPacks}
                    onValueChange={(q) => onCambiaQuantita(riga.id, q)}
                    label={`Confezioni di ${riga.name}`}
                    visuallyHideLabel
                    min={CONFEZIONI_MIN}
                    max={CONFEZIONI_MAX}
                  />

                  <span className="tabellare w-24 text-right text-sm font-bold text-neutral-950">
                    {euro(riga.lineTotalNet)}
                  </span>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRimuovi(riga.id)}
                    aria-label={`Togli ${riga.name} dall’ordine`}
                  >
                    Togli
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function OrderBar({
  ordine,
  aperto,
  onApri,
  onCambiaQuantita,
  onRimuovi,
}: {
  ordine: OrdineCorrente;
  aperto: boolean;
  onApri: () => void;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  onRimuovi: (rigaId: string) => void;
}) {
  const t = ordine.totali;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
      {aperto && (
        <div className="border-b border-neutral-200">
          <Riepilogo
            ordine={ordine}
            onCambiaQuantita={onCambiaQuantita}
            onRimuovi={onRimuovi}
          />
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="tabellare flex flex-wrap items-baseline gap-x-3 text-sm text-neutral-700">
          <span>
            <strong className="text-neutral-950">{t.righe}</strong>{' '}
            {t.righe === 1 ? 'prodotto' : 'prodotti'}
          </span>
          <span>
            <strong className="text-neutral-950">{t.confezioni}</strong>{' '}
            {t.confezioni === 1 ? 'confezione' : 'confezioni'}
          </span>
          <span className="text-lg font-black text-neutral-950">{euro(t.netto)}</span>
          {Number(t.iva) > 0 && (
            <span className="text-xs text-neutral-500">{euro(t.lordo)} con IVA</span>
          )}
          {ordine.perFornitore.length > 1 && (
            <Badge variant="neutral">{ordine.perFornitore.length} fornitori</Badge>
          )}
        </p>

        <Button
          variant={aperto ? 'secondary' : 'primary'}
          onClick={onApri}
          disabled={t.righe === 0}
          className="min-h-11"
          aria-expanded={aperto}
        >
          {aperto ? 'Chiudi il riepilogo' : 'Guarda riepilogo ordine'}
        </Button>
      </div>
    </div>
  );
}
