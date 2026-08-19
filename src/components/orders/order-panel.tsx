'use client';

import { AppIcon } from '@/components/app-icon';
import type { OrdineCorrente } from '@/features/orders/dto';
import { CONFEZIONI_MAX, CONFEZIONI_MIN } from '@/features/orders/schema';
import { euro, nomeLeggibile } from '@/features/products/format';

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

/**
 * «Lo trovi a meno da un altro».
 *
 * Non blocca e non si mette in mezzo: sta sotto la riga, in una striscia
 * gialla, e si può zittire per sempre su quel prodotto. Un avviso che
 * costringe a rispondere per andare avanti viene chiuso senza leggerlo, e a
 * quel punto non ha informato nessuno.
 *
 * Il conto delle confezioni si mostra **prima** di far premere: passare da
 * 12 a 24 pezzi non è un cambio di prezzo, è un cambio di quantità, e un
 * cambio di quantità fatto in silenzio si scopre alla consegna.
 */
function Avviso({
  riga,
  onCambia,
  onIgnora,
  inCorso,
}: {
  riga: OrdineCorrente['righe'][number];
  onCambia: (rigaId: string, supplierProductId: string) => void;
  onIgnora: (rigaId: string) => void;
  inCorso: boolean;
}) {
  const a = riga.avviso;
  if (!a || !a.meritaAvviso || riga.avvisoIgnorato) return null;

  return (
    <div className="border-t border-amber-100 bg-amber-50 px-4 py-3">
      <p className="text-xs leading-5 text-amber-900">
        Disponibile a <strong>{euro(a.migliore.priceNet)}</strong> da{' '}
        <strong>{a.migliore.supplierName}</strong>. Risparmieresti{' '}
        <strong>{euro(a.risparmioPerConfezione)}</strong> a confezione
        {riga.quantityPacks > 1 && (
          <>
            {' '}
            ({euro(a.risparmioTotale)} su {riga.quantityPacks})
          </>
        )}
        .
      </p>
      {!a.cambio.esatto && (
        <p className="mt-1 text-xs leading-5 text-amber-800">
          ⚠ Le confezioni non coincidono: {a.cambio.descrizione}.
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={inCorso}
          onClick={() => onCambia(riga.id, a.migliore.supplierProductId)}
          title={`${a.cambio.descrizione} · spesa ${euro(a.cambio.spesaPrima)} → ${euro(a.cambio.spesaDopo)}`}
          className="min-h-8 cursor-pointer rounded-lg bg-amber-600 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60"
        >
          {inCorso ? 'Cambio…' : 'Usa il più conveniente'}
        </button>
        <span className="tabellare text-xs text-amber-800">
          {a.cambio.confezioni} × {a.migliore.packQuantity} pz · {euro(a.cambio.spesaPrima)} →{' '}
          {euro(a.cambio.spesaDopo)}
        </span>
        <button
          type="button"
          onClick={() => onIgnora(riga.id)}
          className="ml-auto cursor-pointer text-xs text-amber-700 hover:underline"
        >
          non avvisarmi più
        </button>
      </div>
    </div>
  );
}

function Riga({
  riga,
  onCambiaQuantita,
  onRimuovi,
  onCambiaFornitore,
  onIgnoraAvviso,
  inCorso,
}: {
  riga: OrdineCorrente['righe'][number];
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  onRimuovi: (rigaId: string) => void;
  onCambiaFornitore: (rigaId: string, supplierProductId: string) => void;
  onIgnoraAvviso: (rigaId: string) => void;
  inCorso: boolean;
}) {
  return (
    <>
      <li className="group flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-base leading-[1.25] font-semibold text-neutral-950">
            {nomeLeggibile(riga.name)}
          </p>
          <p className="tabellare mt-1 text-sm text-neutral-500">
            {riga.quantityPacks} × {euro(riga.priceNet)}
            {riga.packQuantity > 1 && ` · confezione da ${riga.packQuantity}`}
          </p>
          {Number(riga.scontoExtraPct) > 0 && (
            <span className="mt-1 inline-block rounded-lg bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700">
              −{riga.scontoExtraPct}% · {euro(riga.ritornoAtteso)} a rimborso
            </span>
          )}
        </div>

        <span className="border-brand-200 bg-brand-50 flex shrink-0 items-center rounded-full border">
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
            className="text-brand-700 hover:bg-brand-100 grid h-11 w-9 cursor-pointer place-items-center rounded-l-full transition-colors"
          >
            <span aria-hidden className="leading-none font-bold">
              {riga.quantityPacks <= CONFEZIONI_MIN ? '×' : '−'}
            </span>
          </button>
          <span className="tabellare w-7 text-center text-base font-bold text-neutral-950">
            {riga.quantityPacks}
          </span>
          <button
            type="button"
            onClick={() =>
              onCambiaQuantita(riga.id, Math.min(riga.quantityPacks + 1, CONFEZIONI_MAX))
            }
            aria-label={`Una confezione in più di ${riga.name}`}
            className="text-brand-700 hover:bg-brand-100 grid h-11 w-9 cursor-pointer place-items-center rounded-r-full transition-colors"
          >
            <span aria-hidden className="leading-none font-bold">
              +
            </span>
          </button>
        </span>

        <span className="tabellare w-20 shrink-0 text-right font-bold text-neutral-950">
          {euro(riga.lineTotalNet)}
        </span>
      </li>
      <Avviso
        riga={riga}
        onCambia={onCambiaFornitore}
        onIgnora={onIgnoraAvviso}
        inCorso={inCorso}
      />
    </>
  );
}

export function OrderPanel({
  ordine,
  onCambiaQuantita,
  onRimuovi,
  onSvuota,
  onCambiaFornitore,
  onIgnoraAvviso,
  inCorso,
}: {
  ordine: OrdineCorrente;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  onRimuovi: (rigaId: string) => void;
  onSvuota: () => void;
  onCambiaFornitore: (rigaId: string, supplierProductId: string) => void;
  onIgnoraAvviso: (rigaId: string) => void;
  inCorso: boolean;
}) {
  const t = ordine.totali;

  return (
    <div className="flex flex-col bg-white">
      {/* Niente titolo qui: il foglio che ospita il pannello ne ha già uno,
          e ripeterlo toglieva una riga a un elenco che sul telefono ne ha
          poche. Resta il solo comando che serve. */}
      {ordine.righe.length > 0 && (
        <div className="flex justify-end border-b border-neutral-100 px-4 py-3">
          <button
            type="button"
            onClick={onSvuota}
            className="min-h-9 cursor-pointer rounded-lg px-2 text-sm font-semibold text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-700"
          >
            Svuota l’ordine
          </button>
        </div>
      )}

      {ordine.righe.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm leading-6 text-neutral-500">
          L’ordine non contiene articoli.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {ordine.perFornitore.map((gruppo) => (
            <section key={gruppo.supplierId}>
              <h3 className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-y border-neutral-200 bg-neutral-100 px-4 py-3 text-xs font-bold tracking-wider text-neutral-600 uppercase">
                <span className="truncate">{gruppo.supplierName}</span>
                <span className="tabellare shrink-0 font-normal text-neutral-500">
                  {euro(gruppo.netto)}
                  {Number(gruppo.ritornoAtteso) > 0 && (
                    <span className="ml-1 text-violet-700">−{euro(gruppo.ritornoAtteso)}</span>
                  )}
                </span>
              </h3>
              <ul className="divide-y divide-neutral-100">
                {ordine.righe
                  .filter((r) => r.supplierId === gruppo.supplierId)
                  .map((riga) => (
                    <Riga
                      key={riga.id}
                      riga={riga}
                      onCambiaQuantita={onCambiaQuantita}
                      onRimuovi={onRimuovi}
                      onCambiaFornitore={onCambiaFornitore}
                      onIgnoraAvviso={onIgnoraAvviso}
                      inCorso={inCorso}
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
          <span className="tabellare text-2xl font-extrabold tracking-[-0.03em] text-neutral-950">
            {euro(t.netto)}
          </span>
        </div>
        {/* «+ IVA», non l'IVA calcolata.
            L'aliquota di ogni articolo quasi mai arriva dal listino, quindi
            si userebbe il 22% predefinito su tutto: un totale con IVA
            costruito così ha la faccia di un numero esatto e non lo è, e
            nessuno saprebbe che non lo è. Il netto invece è il prezzo vero,
            ed è quello su cui si decide. L'IVA la fa il fornitore in
            fattura. */}
        <p className="mt-0.5 text-right text-xs text-neutral-500">più IVA</p>

        {/* Lo sconto extra sta ACCANTO al totale, non dentro: il totale dice
            quanto si paga adesso, questo quanto si riavrà. Scontarlo dal
            totale darebbe un documento che non corrisponde alla fattura. */}
        {Number(t.ritornoAtteso) > 0 && (
          <p className="tabellare mt-1 rounded-lg bg-violet-50 px-2 py-1 text-right text-xs text-violet-800">
            <strong>{euro(t.ritornoAtteso)}</strong> verranno rimborsati in base agli sconti
            concordati
          </p>
        )}

        {/* Il risparmio dell'ordine intero: conta solo ciò che è oltre soglia
            e non messo a tacere, o sarebbe un totale che nessuno incassa. */}
        {t.righeConAvviso > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 px-2.5 py-2 text-sm leading-5 text-amber-900">
            <AppIcon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Su {t.righeConAvviso} {t.righeConAvviso === 1 ? 'riga' : 'righe'} è disponibile un
              risparmio di <strong>{euro(t.risparmioPotenziale)}</strong> cambiando fornitore.
            </span>
          </p>
        )}

        {/* Nessun pulsante qui: il foglio che ospita il pannello ne ha già
            uno in fondo, sempre visibile. Due comandi identici a due
            centimetri di distanza fanno esitare invece di guidare. */}
      </footer>
    </div>
  );
}
