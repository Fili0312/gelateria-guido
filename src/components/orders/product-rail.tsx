'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import type { OffertaOrdinabile, RisultatoOrdinabile } from '@/features/orders/dto';
import { CONFEZIONI_MAX, CONFEZIONI_MIN } from '@/features/orders/schema';
import { etichettaBasis, euro, formatoConfezione } from '@/features/products/format';

/**
 * Il catalogo da cui si ordina: una riga per prodotto, minimale.
 *
 * Una riga sola in altezza, non una scheda. Con trecento prodotti la
 * differenza fra 44 e 96 pixel di riga è fra vederne dodici e vederne cinque,
 * e vederne dodici è la ragione per cui si scorre invece di cercare.
 *
 * Tutto ciò che serve a decidere sta su una riga: nome, formato, prezzo,
 * prezzo per unità e fornitore. Quello che serve a **capire** — gli altri
 * fornitori — si apre solo se lo si chiede.
 */

function Quantita({
  quantita,
  onCambia,
  onTogli,
}: {
  quantita: number;
  onCambia: (q: number) => void;
  onTogli: () => void;
}) {
  return (
    <span className="border-brand-200 bg-brand-50 flex items-center gap-0.5 rounded-lg border">
      <button
        type="button"
        onClick={() => (quantita <= CONFEZIONI_MIN ? onTogli() : onCambia(quantita - 1))}
        aria-label={quantita <= CONFEZIONI_MIN ? 'Togli dall’ordine' : 'Una confezione in meno'}
        className="text-brand-800 hover:bg-brand-100 grid h-11 w-9 cursor-pointer place-items-center rounded-l-lg transition-colors"
      >
        <AppIcon name={quantita <= CONFEZIONI_MIN ? 'warning' : 'chevron'} className="hidden" />
        <span aria-hidden className="text-lg leading-none font-bold">
          {quantita <= CONFEZIONI_MIN ? '×' : '−'}
        </span>
      </button>
      <span className="tabellare w-7 text-center text-sm font-black text-neutral-950">
        {quantita}
      </span>
      <button
        type="button"
        onClick={() => onCambia(Math.min(quantita + 1, CONFEZIONI_MAX))}
        aria-label="Una confezione in più"
        className="text-brand-800 hover:bg-brand-100 grid h-11 w-9 cursor-pointer place-items-center rounded-r-lg transition-colors"
      >
        <span aria-hidden className="text-lg leading-none font-bold">
          +
        </span>
      </button>
    </span>
  );
}

function Offerta({ offerta, compatta = false }: { offerta: OffertaOrdinabile; compatta?: boolean }) {
  return (
    <>
      <span className="tabellare font-semibold text-neutral-950">{euro(offerta.priceNet)}</span>
      {offerta.unitPrice && offerta.unitPriceBasis && (
        <span className="tabellare text-neutral-400">
          {`${euro(offerta.unitPrice, 4)}${etichettaBasis(offerta.unitPriceBasis).slice(1)}`}
        </span>
      )}
      <span className={compatta ? 'text-neutral-500' : 'text-neutral-500'}>
        {offerta.supplierName}
      </span>
      {offerta.migliore && (
        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-semibold text-green-800">
          migliore
        </span>
      )}
      {offerta.stale && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
          fermo
        </span>
      )}
    </>
  );
}

function Riga({
  risultato,
  attiva,
  perOfferta,
  onSeleziona,
  onAggiungi,
  onCambiaQuantita,
}: {
  risultato: RisultatoOrdinabile;
  attiva: boolean;
  perOfferta: Map<string, { rigaId: string; quantita: number }>;
  onSeleziona: () => void;
  onAggiungi: (supplierProductId: string) => void;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
}) {
  const prima0 = risultato.offerte[0];
  const altre0 = risultato.offerte.slice(1);
  // Quando due fornitori vendono lo stesso articolo si vedono **entrambi**,
  // aperti. Nasconderne uno dietro una freccia significa che nove volte su
  // dieci non lo si guarda — e quel confronto è la ragione per cui il
  // prodotto è stato collegato.
  const [aperto, setAperto] = useState(altre0.length > 0);
  const elemento = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (attiva) elemento.current?.scrollIntoView({ block: 'nearest' });
  }, [attiva]);

  const prima = prima0;
  const altre = altre0;
  const gia = prima ? perOfferta.get(prima.supplierProductId) : undefined;

  return (
    <li
      ref={elemento}
      onMouseEnter={onSeleziona}
      className={`border-l-2 transition-colors ${
        attiva ? 'border-brand-500 bg-brand-50/40' : 'border-transparent hover:bg-neutral-50'
      }`}
    >
      <div className="flex items-center gap-3 py-1.5 pr-2 pl-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-950">{risultato.name}</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="text-neutral-500">
              {formatoConfezione(risultato.unitSize, risultato.unitOfMeasure, 1)}
            </span>
            {prima ? (
              <>
                <span className="text-neutral-300">·</span>
                <Offerta offerta={prima} />
                {prima.packQuantity > 1 && (
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600">
                    collo da {prima.packQuantity}
                  </span>
                )}
              </>
            ) : (
              <span className="text-amber-700">{risultato.nonOrdinabile}</span>
            )}
          </p>
        </div>

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
            title={aperto ? 'Nascondi gli altri fornitori' : `Altri ${altre.length} fornitori`}
            className="grid h-11 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <AppIcon
              name="chevron"
              className={`h-4 w-4 transition-transform ${aperto ? 'rotate-90' : ''}`}
            />
          </button>
        )}

        {prima &&
          (gia ? (
            <Quantita
              quantita={gia.quantita}
              onCambia={(q) => onCambiaQuantita(gia.rigaId, q)}
              onTogli={() => onCambiaQuantita(gia.rigaId, CONFEZIONI_MIN)}
            />
          ) : (
            <button
              type="button"
              onClick={() => onAggiungi(prima.supplierProductId)}
              aria-label={`Aggiungi ${risultato.name} all’ordine`}
              className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-600 grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span aria-hidden className="text-xl leading-none font-bold">
                +
              </span>
            </button>
          ))}
      </div>

      {aperto && altre.length > 0 && (
        <>
          {/* Perché guardare le alternative: senza questa riga sono solo altri
              numeri, e restano lì senza far decidere niente. */}
          {risultato.confrontato && risultato.risparmioPerConfezione && (
            <p className="border-t border-neutral-100 bg-green-50/60 px-6 py-1 text-xs text-green-900">
              Conviene da <strong>{prima!.supplierName}</strong>:{' '}
              <strong>{euro(risultato.risparmioPerConfezione)}</strong> in meno a confezione
              rispetto all’altro fornitore.
            </p>
          )}
        <ul className="space-y-1 border-t border-neutral-100 bg-neutral-50/70 py-1.5 pr-2 pl-6">
          {altre.map((offerta) => {
            const suo = perOfferta.get(offerta.supplierProductId);
            return (
              <li key={offerta.supplierProductId} className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-xs">
                  <Offerta offerta={offerta} compatta />
                  <span className="text-neutral-400">
                    {formatoConfezione(offerta.unitSize, offerta.unitOfMeasure, offerta.packQuantity)}
                  </span>
                </span>
                {suo ? (
                  <Quantita
                    quantita={suo.quantita}
                    onCambia={(q) => onCambiaQuantita(suo.rigaId, q)}
                    onTogli={() => onCambiaQuantita(suo.rigaId, CONFEZIONI_MIN)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onAggiungi(offerta.supplierProductId)}
                    aria-label={`Aggiungi ${risultato.name} da ${offerta.supplierName}`}
                    className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition-colors hover:border-neutral-400"
                  >
                    <span aria-hidden className="text-lg leading-none font-bold">
                      +
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        </>
      )}
    </li>
  );
}

/**
 * L'elenco, spezzato per categoria.
 *
 * Un elenco di trecento righe di fila non ha appigli: si scorre e si perde il
 * segno. Le intestazioni di categoria restano appiccicate in cima mentre si
 * scorre, così si sa **sempre** in che parte del catalogo si è — e per saltare
 * altrove ci sono i filtri, non il rotolamento.
 *
 * Quando si è già scelta una categoria non si raggruppa: sarebbe un gruppo
 * solo, con l'intestazione a ripetere il filtro appena premuto.
 */
export function ProductRail({
  risultati,
  raggruppa = true,
  selezione,
  perOfferta,
  onSeleziona,
  onAggiungi,
  onCambiaQuantita,
}: {
  risultati: RisultatoOrdinabile[];
  raggruppa?: boolean;
  selezione: number;
  perOfferta: Map<string, { rigaId: string; quantita: number }>;
  onSeleziona: (indice: number) => void;
  onAggiungi: (supplierProductId: string) => void;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
}) {
  if (risultati.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center text-sm leading-6 text-neutral-500">
        Nessun prodotto qui. Prova col codice del fornitore, con una parola sola, o togli un filtro.
      </p>
    );
  }

  const riga = (risultato: RisultatoOrdinabile, indice: number) => (
    <Riga
      key={risultato.productId}
      risultato={risultato}
      attiva={indice === selezione}
      perOfferta={perOfferta}
      onSeleziona={() => onSeleziona(indice)}
      onAggiungi={onAggiungi}
      onCambiaQuantita={onCambiaQuantita}
    />
  );

  if (!raggruppa) {
    return (
      <ul
        className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        aria-label="Prodotti da ordinare"
      >
        {risultati.map(riga)}
      </ul>
    );
  }

  // I gruppi conservano l'ordine in cui i prodotti sono arrivati: la ricerca
  // li dà per pertinenza, e riordinarli per categoria butterebbe via proprio
  // l'informazione per cui si è cercato.
  const gruppi: { chiave: string; nome: string; indici: number[] }[] = [];
  const posizione = new Map<string, number>();
  risultati.forEach((r, indice) => {
    const chiave = r.category?.id ?? 'senza';
    let dove = posizione.get(chiave);
    if (dove === undefined) {
      dove = gruppi.length;
      posizione.set(chiave, dove);
      gruppi.push({ chiave, nome: r.category?.name ?? 'Senza categoria', indici: [] });
    }
    gruppi[dove]!.indici.push(indice);
  });

  return (
    <div
      className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
      aria-label="Prodotti da ordinare"
    >
      {gruppi.map((gruppo, i) => (
        <section key={gruppo.chiave} className={i === 0 ? '[&>h3]:border-t-0' : undefined}>
          {/* Non appiccicate in cima: sopra c'è già una barra sticky di
              altezza variabile — ricerca, reparti, categorie — e qualunque
              scostamento fisso finisce per coprire una riga. Una riga coperta
              è la riga che si stava per premere. */}
          <h3 className="flex items-baseline justify-between gap-2 border-y border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
            <span className="truncate">{gruppo.nome}</span>
            <span className="tabellare shrink-0 font-normal text-neutral-400">
              {gruppo.indici.length}
            </span>
          </h3>
          <ul className="divide-y divide-neutral-100">
            {gruppo.indici.map((indice) => riga(risultati[indice]!, indice))}
          </ul>
        </section>
      ))}
    </div>
  );
}
