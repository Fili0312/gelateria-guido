'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import type { Gruppo } from './catalog-filters';

/**
 * Filtri e ordinamento, in una riga sola.
 *
 * ── Perché i filtri stanno dietro un bottone ────────────────────────────
 * Sono cose che si toccano una volta ogni tanto: reparto, «solo dove c'è un
 * confronto». Tenerli sempre aperti costa due righe di schermo su ogni
 * apertura per un comando usato una volta su venti — e sul telefono quelle
 * due righe sono un prodotto e mezzo in meno.
 *
 * L'ordinamento invece resta **fuori**, visibile: dice come è ordinato
 * l'elenco che si sta guardando, e serve saperlo anche quando non si vuole
 * cambiarlo.
 */

export type Ordinamento = 'rilevanza' | 'nome' | 'prezzo-su' | 'prezzo-giu';

export const ETICHETTE: Record<Ordinamento, string> = {
  rilevanza: 'Più rilevanti',
  nome: 'Nome A-Z',
  'prezzo-su': 'Prezzo crescente',
  'prezzo-giu': 'Prezzo decrescente',
};

export interface Filtri {
  reparto: string | null;
  /** Solo prodotti venduti da più fornitori: quelli su cui si può scegliere. */
  soloConfrontabili: boolean;
  /** Nasconde ciò che non si può mettere nell'ordine. */
  nascondiNonOrdinabili: boolean;
}

export const FILTRI_VUOTI: Filtri = {
  reparto: null,
  soloConfrontabili: false,
  nascondiNonOrdinabili: false,
};

export function quantiAttivi(filtri: Filtri): number {
  return (
    (filtri.reparto ? 1 : 0) +
    (filtri.soloConfrontabili ? 1 : 0) +
    (filtri.nascondiNonOrdinabili ? 1 : 0)
  );
}

function Interruttore({
  attivo,
  onCambia,
  titolo,
  spiegazione,
}: {
  attivo: boolean;
  onCambia: (v: boolean) => void;
  titolo: string;
  spiegazione: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-neutral-50">
      <input
        type="checkbox"
        checked={attivo}
        onChange={(e) => onCambia(e.target.checked)}
        className="text-brand-600 focus:ring-brand-500/30 mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-neutral-300 focus:ring-4"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-neutral-900">{titolo}</span>
        <span className="block text-xs leading-4 text-neutral-500">{spiegazione}</span>
      </span>
    </label>
  );
}

export function CatalogToolbar({
  reparti,
  filtri,
  onFiltri,
  ordinamento,
  onOrdinamento,
}: {
  reparti: Gruppo[];
  filtri: Filtri;
  onFiltri: (f: Filtri) => void;
  ordinamento: Ordinamento;
  onOrdinamento: (o: Ordinamento) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const pannello = useRef<HTMLDivElement>(null);
  const attivi = quantiAttivi(filtri);

  // Si chiude premendo fuori o con Esc: un pannello che resta aperto mentre
  // si scorre l'elenco copre proprio i prodotti che si stanno filtrando.
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      if (!pannello.current?.contains(e.target as Node)) setAperto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAperto(false);
    };
    document.addEventListener('mousedown', fuori);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuori);
      document.removeEventListener('keydown', esc);
    };
  }, [aperto]);

  return (
    <div className="flex items-center gap-2" ref={pannello}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAperto((v) => !v)}
          aria-expanded={aperto}
          className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-[0.9rem] border px-3 text-[13px] font-semibold transition-colors ${
            attivi > 0
              ? 'border-brand-400 bg-brand-50 text-brand-800'
              : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          >
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
          Filtri
          {attivi > 0 && (
            <span className="bg-brand-600 tabellare grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold text-white">
              {attivi}
            </span>
          )}
        </button>

        {aperto && (
          <div className="absolute top-full left-0 z-30 mt-2 w-[19rem] rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl shadow-neutral-900/15">
            {reparti.length > 1 && (
              <div className="px-2 pt-1 pb-2">
                <p className="mb-1.5 text-xs font-bold tracking-wide text-neutral-500 uppercase">
                  Reparto
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onFiltri({ ...filtri, reparto: null })}
                    className={`min-h-9 cursor-pointer rounded-lg border px-2.5 text-sm ${
                      filtri.reparto === null
                        ? 'border-neutral-900 bg-neutral-900 font-semibold text-white'
                        : 'border-neutral-200 text-neutral-700'
                    }`}
                  >
                    Tutti
                  </button>
                  {reparti.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onFiltri({ ...filtri, reparto: r.id })}
                      className={`min-h-9 cursor-pointer rounded-lg border px-2.5 text-sm ${
                        filtri.reparto === r.id
                          ? 'border-neutral-900 bg-neutral-900 font-semibold text-white'
                          : 'border-neutral-200 text-neutral-700'
                      }`}
                    >
                      {r.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Interruttore
              attivo={filtri.soloConfrontabili}
              onCambia={(v) => onFiltri({ ...filtri, soloConfrontabili: v })}
              titolo="Solo articoli confrontabili"
              spiegazione="Prodotti venduti da più di un fornitore."
            />
            <Interruttore
              attivo={filtri.nascondiNonOrdinabili}
              onCambia={(v) => onFiltri({ ...filtri, nascondiNonOrdinabili: v })}
              titolo="Nascondi articoli senza prezzo"
              spiegazione="Restano a catalogo ma non compaiono in questo elenco."
            />

            {attivi > 0 && (
              <button
                type="button"
                onClick={() => onFiltri(FILTRI_VUOTI)}
                className="mt-1 min-h-10 w-full cursor-pointer rounded-xl text-sm font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Rimuovi tutti i filtri
              </button>
            )}
          </div>
        )}
      </div>

      <div className="relative ml-auto min-w-0 flex-1">
        {/* Un `select` vero, non un menu costruito a mano: sul telefono apre
            la rotella di sistema, che si usa con una mano sola e senza
            imparare niente. */}
        <select
          value={ordinamento}
          onChange={(e) => onOrdinamento(e.target.value as Ordinamento)}
          aria-label="Ordina i prodotti"
          className="focus:border-brand-500 focus:ring-brand-500/30 h-11 w-full cursor-pointer appearance-none rounded-[0.9rem] border border-neutral-200 bg-white py-0 pr-9 pl-3.5 text-[13px] font-semibold text-neutral-600 outline-none focus:ring-4"
        >
          {(Object.keys(ETICHETTE) as Ordinamento[]).map((o) => (
            <option key={o} value={o}>
              {ETICHETTE[o]}
            </option>
          ))}
        </select>
        <AppIcon
          name="chevron"
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 rotate-90 text-neutral-400"
        />
      </div>
    </div>
  );
}
