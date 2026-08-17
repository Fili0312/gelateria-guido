'use client';

import Link from 'next/link';
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
    <div className="border-t border-amber-100 bg-amber-50 px-3 py-2">
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
      <li className="group flex items-center gap-2 py-1.5 pr-1 pl-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-neutral-900">{riga.name}</p>
          <p className="tabellare text-xs text-neutral-500">
            {riga.quantityPacks} × {euro(riga.priceNet)}
            {riga.packQuantity > 1 && ` · collo da ${riga.packQuantity}`}
            {Number(riga.scontoExtraPct) > 0 && (
              <span className="ml-1 text-violet-700">
                · −{riga.scontoExtraPct}%, ti tornano {euro(riga.ritornoAtteso)}
              </span>
            )}
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
            onClick={() =>
              onCambiaQuantita(riga.id, Math.min(riga.quantityPacks + 1, CONFEZIONI_MAX))
            }
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
    <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-baseline justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 className="font-black text-neutral-950">Ordine</h2>
        <Link
          href="/ordini/storico"
          className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
        >
          Storico
        </Link>
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
                  {Number(gruppo.ritornoAtteso) > 0 && (
                    <span className="ml-1 text-violet-700">−{euro(gruppo.ritornoAtteso)}</span>
                  )}
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
          <span className="tabellare text-2xl font-black tracking-[-0.03em] text-neutral-950">
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
            <strong>{euro(t.ritornoAtteso)}</strong> torneranno indietro per gli sconti concordati
          </p>
        )}

        {/* Il risparmio dell'ordine intero: conta solo ciò che è oltre soglia
            e non messo a tacere, o sarebbe un totale che nessuno incassa. */}
        {t.righeConAvviso > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs leading-4 text-amber-900">
            <AppIcon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Su {t.righeConAvviso} {t.righeConAvviso === 1 ? 'riga' : 'righe'} risparmieresti{' '}
              <strong>{euro(t.risparmioPotenziale)}</strong> cambiando fornitore.
            </span>
          </p>
        )}

        {/* Porta al riepilogo, non conferma da qui: confermare è la cosa più
            difficile da disfare di tutta l'app, e merita che ci si arrivi
            apposta invece di trovarcisi con un clic di fianco al «+». */}
        <Link
          href={ordine.righe.length > 0 ? '/ordini/riepilogo' : '#'}
          aria-disabled={ordine.righe.length === 0}
          className={`mt-3 flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors ${
            ordine.righe.length > 0
              ? 'bg-brand-600 hover:bg-brand-700 cursor-pointer text-white'
              : 'pointer-events-none bg-neutral-200 text-neutral-500'
          }`}
        >
          Vai al riepilogo
        </Link>
      </footer>
    </div>
  );
}
