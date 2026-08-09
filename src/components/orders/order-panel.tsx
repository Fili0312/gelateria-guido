'use client';

import { AppIcon } from '@/components/app-icon';
import type { OrdineCorrente } from '@/features/orders/dto';
import { CONFEZIONI_MAX, CONFEZIONI_MIN } from '@/features/orders/schema';
import { euro } from '@/features/products/format';

/**
 * L'ordine, di fianco al catalogo.
 *
 * Sta fermo e si vede sempre. Il riepilogo non è una schermata a parte né un
 * pannello che si apre: è questa colonna, e cresce mentre si aggiunge.
 *
 * Le righe sono raggruppate per fornitore perché è così che l'ordine partirà —
 * un totale unico non dice a nessuno quanto si sta ordinando da chi, e la
 * prima domanda quando si chiude un ordine è proprio «quanto viene da
 * Cecconi?».
 */

function Riga({
  riga,
  onCambiaQuantita,
  onRimuovi,
}: {
  riga: OrdineCorrente['righe'][number];
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  onRimuovi: (rigaId: string) => void;
}) {
  return (
    <li className="group flex items-center gap-2 py-1.5 pr-1 pl-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-neutral-900">{riga.name}</p>
        <p className="tabellare text-xs text-neutral-500">
          {riga.quantityPacks} × {euro(riga.priceNet)}
          {riga.packQuantity > 1 && ` · collo da ${riga.packQuantity}`}
        </p>
      </div>

      <span className="flex items-center rounded-lg border border-neutral-200">
        <button
          type="button"
          onClick={() =>
            riga.quantityPacks <= CONFEZIONI_MIN
              ? onRimuovi(riga.id)
              : onCambiaQuantita(riga.id, riga.quantityPacks - 1)
          }
          aria-label={
            riga.quantityPacks <= CONFEZIONI_MIN
              ? `Togli ${riga.name} dall’ordine`
              : `Una confezione in meno di ${riga.name}`
          }
          className="grid h-9 w-8 cursor-pointer place-items-center rounded-l-lg text-neutral-600 transition-colors hover:bg-neutral-100"
        >
          <span aria-hidden className="leading-none font-bold">
            {riga.quantityPacks <= CONFEZIONI_MIN ? '×' : '−'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onCambiaQuantita(riga.id, Math.min(riga.quantityPacks + 1, CONFEZIONI_MAX))}
          aria-label={`Una confezione in più di ${riga.name}`}
          className="grid h-9 w-8 cursor-pointer place-items-center rounded-r-lg text-neutral-600 transition-colors hover:bg-neutral-100"
        >
          <span aria-hidden className="leading-none font-bold">
            +
          </span>
        </button>
      </span>

      <span className="tabellare w-16 shrink-0 text-right text-sm font-bold text-neutral-950">
        {euro(riga.lineTotalNet)}
      </span>
    </li>
  );
}

export function OrderPanel({
  ordine,
  onCambiaQuantita,
  onRimuovi,
  onSvuota,
}: {
  ordine: OrdineCorrente;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  onRimuovi: (rigaId: string) => void;
  onSvuota: () => void;
}) {
  const t = ordine.totali;
  const risparmiPersi = ordine.righe.filter((r) => r.migliorAlternativa).length;

  return (
    <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-baseline justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 className="font-black text-neutral-950">Ordine</h2>
        {ordine.righe.length > 0 && (
          <button
            type="button"
            onClick={onSvuota}
            className="cursor-pointer text-xs text-neutral-400 transition-colors hover:text-red-600"
          >
            Svuota
          </button>
        )}
      </header>

      {ordine.righe.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm leading-6 text-neutral-500">
          Ancora vuoto.
          <br />
          Premi <span className="font-semibold text-neutral-700">+</span> su un prodotto a sinistra.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {ordine.perFornitore.map((gruppo) => (
            <section key={gruppo.supplierId}>
              <h3 className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                <span className="truncate">{gruppo.supplierName}</span>
                <span className="tabellare shrink-0 font-normal text-neutral-500">
                  {euro(gruppo.netto)}
                </span>
              </h3>
              <ul className="divide-y divide-neutral-50">
                {ordine.righe
                  .filter((r) => r.supplierId === gruppo.supplierId)
                  .map((riga) => (
                    <Riga
                      key={riga.id}
                      riga={riga}
                      onCambiaQuantita={onCambiaQuantita}
                      onRimuovi={onRimuovi}
                    />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="border-t border-neutral-200 bg-neutral-50 px-4 py-3">
        {/* Il numero che si guarda è il netto: il lordo sta sotto, piccolo,
            perché è quello che si controlla in fattura, non mentre si ordina. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-neutral-600">
            {t.righe} {t.righe === 1 ? 'prodotto' : 'prodotti'} · {t.confezioni}{' '}
            {t.confezioni === 1 ? 'conf.' : 'conf.'}
          </span>
          <span className="tabellare text-2xl font-black tracking-[-0.03em] text-neutral-950">
            {euro(t.netto)}
          </span>
        </div>
        {Number(t.iva) > 0 && (
          <p className="tabellare mt-0.5 text-right text-xs text-neutral-500">
            {euro(t.lordo)} con IVA
          </p>
        )}

        {risparmiPersi > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs leading-4 text-amber-900">
            <AppIcon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {risparmiPersi}{' '}
              {risparmiPersi === 1 ? 'riga costa' : 'righe costano'} più del minimo possibile.
            </span>
          </p>
        )}

        <button
          type="button"
          disabled
          title="La conferma dell’ordine arriva con la Fase 14."
          className="mt-3 min-h-11 w-full cursor-not-allowed rounded-lg bg-neutral-200 px-4 text-sm font-semibold text-neutral-500"
        >
          Conferma l’ordine
        </button>
      </footer>
    </div>
  );
}
