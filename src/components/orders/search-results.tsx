'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Stepper } from '@/components/ui';
import { CategoryBadge } from '@/components/taxonomy/category-badge';
import type { OffertaOrdinabile, RisultatoOrdinabile } from '@/features/orders/dto';
import { CONFEZIONI_MAX, CONFEZIONI_MIN } from '@/features/orders/schema';
import { etichettaBasis, euro, formatoConfezione } from '@/features/products/format';

/**
 * I risultati della ricerca, densi.
 *
 * Ogni riga deve bastare a decidere senza aprire nulla: cosa è, da chi
 * conviene, quanto costa la confezione e quanto costa al litro. Un elenco che
 * costringe ad aprire una scheda per sapere il prezzo raddoppia il numero di
 * gesti per ogni articolo, e un ordine ne ha trenta.
 */

function Offerta({ offerta }: { offerta: OffertaOrdinabile }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="tabellare font-semibold text-neutral-950">{euro(offerta.priceNet)}</span>
      {offerta.unitPrice && offerta.unitPriceBasis && (
        <span className="tabellare text-xs text-neutral-500">
          {`${euro(offerta.unitPrice, 4)}${etichettaBasis(offerta.unitPriceBasis).slice(1)}`}
        </span>
      )}
      <span className="text-xs text-neutral-500">
        {formatoConfezione(offerta.unitSize, offerta.unitOfMeasure, offerta.packQuantity)} ·{' '}
        {offerta.supplierName}
      </span>
      {offerta.migliore && <Badge variant="success">miglior prezzo</Badge>}
      {offerta.stale && <Badge variant="warning">prezzo fermo</Badge>}
    </span>
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
  const [altreVisibili, setAltreVisibili] = useState(false);
  const elemento = useRef<HTMLLIElement>(null);

  // La riga scelta con le frecce deve restare in vista: senza, si continua a
  // premere ↓ e la selezione esce dallo schermo.
  useEffect(() => {
    if (attiva) elemento.current?.scrollIntoView({ block: 'nearest' });
  }, [attiva]);

  const prima = risultato.offerte[0];
  const altre = risultato.offerte.slice(1);

  return (
    <li
      ref={elemento}
      onMouseEnter={onSeleziona}
      className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
        attiva ? 'border-brand-500 ring-brand-200 ring-2' : 'border-neutral-200'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-neutral-950">{risultato.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span>{formatoConfezione(risultato.unitSize, risultato.unitOfMeasure, 1)}</span>
            {risultato.brand && <span>· {risultato.brand}</span>}
            <CategoryBadge categoria={risultato.category} />
          </p>
          {prima ? (
            <p className="mt-2 text-sm">
              <Offerta offerta={prima} />
            </p>
          ) : (
            <p className="mt-2 text-sm text-amber-700">{risultato.nonOrdinabile}</p>
          )}
          {risultato.confrontato && risultato.risparmioPerConfezione && (
            <p className="mt-1 text-xs text-green-800">
              {euro(risultato.risparmioPerConfezione)} in meno a confezione rispetto all’altro
              fornitore
            </p>
          )}
        </div>

        {prima && <Comando
          offerta={prima}
          perOfferta={perOfferta}
          onAggiungi={onAggiungi}
          onCambiaQuantita={onCambiaQuantita}
        />}
      </div>

      {altre.length > 0 && (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <button
            type="button"
            onClick={() => setAltreVisibili((v) => !v)}
            // Su tablet si ordina col dito: un bersaglio alto sedici pixel si
            // manca, e mancarlo qui significa aprire il prodotto sbagliato.
            className="text-brand-700 -mx-2 inline-flex min-h-11 items-center px-2 text-xs font-semibold hover:underline"
          >
            {altreVisibili
              ? 'Nascondi gli altri fornitori'
              : `Altri ${altre.length} ${altre.length === 1 ? 'fornitore' : 'fornitori'}`}
          </button>
          {altreVisibili && (
            <ul className="mt-2 space-y-2">
              {altre.map((offerta) => (
                <li
                  key={offerta.supplierProductId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm"
                >
                  <Offerta offerta={offerta} />
                  <Comando
                    offerta={offerta}
                    perOfferta={perOfferta}
                    onAggiungi={onAggiungi}
                    onCambiaQuantita={onCambiaQuantita}
                    piccolo
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Aggiungi, oppure la quantità già nell'ordine.
 *
 * Lo stesso spazio fa due cose diverse a seconda che l'articolo ci sia già o
 * no: un pulsante «aggiungi» accanto a una quantità farebbe chiedere ogni
 * volta se somma o sostituisce.
 */
function Comando({
  offerta,
  perOfferta,
  onAggiungi,
  onCambiaQuantita,
  piccolo = false,
}: {
  offerta: OffertaOrdinabile;
  perOfferta: Map<string, { rigaId: string; quantita: number }>;
  onAggiungi: (supplierProductId: string) => void;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
  piccolo?: boolean;
}) {
  const gia = perOfferta.get(offerta.supplierProductId);

  if (!gia) {
    return (
      <Button
        size={piccolo ? 'sm' : 'md'}
        onClick={() => onAggiungi(offerta.supplierProductId)}
        // Bersaglio grande: su tablet si ordina col dito, e 44 px è il minimo
        // sotto il quale si sbaglia riga.
        className={piccolo ? undefined : 'min-h-11 min-w-28'}
      >
        Aggiungi
      </Button>
    );
  }

  return (
    <Stepper
      value={gia.quantita}
      onValueChange={(q) => onCambiaQuantita(gia.rigaId, q)}
      label={`Confezioni di ${offerta.rawName}`}
      visuallyHideLabel
      min={CONFEZIONI_MIN}
      max={CONFEZIONI_MAX}
      containerClassName={piccolo ? undefined : 'min-h-11'}
    />
  );
}

export function SearchResults({
  risultati,
  termine,
  cercando,
  selezione,
  perOfferta,
  onSeleziona,
  onAggiungi,
  onCambiaQuantita,
}: {
  risultati: RisultatoOrdinabile[];
  termine: string;
  cercando: boolean;
  selezione: number;
  perOfferta: Map<string, { rigaId: string; quantita: number }>;
  onSeleziona: (indice: number) => void;
  onAggiungi: (supplierProductId: string) => void;
  onCambiaQuantita: (rigaId: string, quantita: number) => void;
}) {
  if (termine.trim().length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
        <p className="text-sm leading-6 text-neutral-500">
          Scrivi nella barra qui sopra per cercare. Trova per nome, per sinonimo, per la
          descrizione del fornitore o per codice articolo.
        </p>
      </div>
    );
  }

  if (risultati.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
        <p className="text-sm leading-6 text-neutral-500">
          {cercando ? 'Sto cercando…' : `Nessun prodotto per «${termine}».`}
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Risultati della ricerca">
      {risultati.map((risultato, indice) => (
        <Riga
          key={risultato.productId}
          risultato={risultato}
          attiva={indice === selezione}
          perOfferta={perOfferta}
          onSeleziona={() => onSeleziona(indice)}
          onAggiungi={onAggiungi}
          onCambiaQuantita={onCambiaQuantita}
        />
      ))}
      {risultati.length === 20 && (
        <li className="px-2 text-center text-xs text-neutral-400">
          Mostrati i primi 20: restringi la ricerca per vederne altri.
        </li>
      )}
    </ul>
  );
}
