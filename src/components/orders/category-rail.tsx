'use client';

import { useEffect, useRef } from 'react';
import { DisegnoCategoria, visualeCategoria } from '@/components/products/categoria-visuale';
import type { Gruppo } from './catalog-filters';

/**
 * Le categorie come card grandi, che scorrono di lato.
 *
 * ── Perché card e non pastiglie ─────────────────────────────────────────
 * Erano pastiglie di testo alte trentasei pixel. Su un telefono, con
 * ventotto categorie, si distinguono solo leggendole una per una — e chi
 * ordina non legge, riconosce. Un disegno sopra il nome si riconosce con la
 * coda dell'occhio mentre il pollice scorre, ed è la differenza fra
 * scegliere e cercare.
 *
 * ── Ma piccole ──────────────────────────────────────────────────────────
 * Novantadue pixel di larghezza, non centoquattro: sono un filtro, non il
 * contenuto della pagina. Ogni pixel speso qui è tolto ai prodotti, che
 * sono la ragione per cui la pagina è stata aperta — e quattro categorie
 * che si intravedono dicono già che la barra scorre.
 *
 * ── Il conteggio dentro, non accanto ────────────────────────────────────
 * Dice quanto c'è **prima** di premere. Una categoria vuota non compare
 * proprio: un filtro che porta a zero risultati è un filtro che non doveva
 * esserci.
 */

function Card({
  attiva,
  nome,
  quanti,
  disegno,
  sfondo,
  onClick,
}: {
  attiva: boolean;
  nome: string;
  quanti: number;
  disegno: React.ReactNode;
  sfondo: string;
  onClick: () => void;
}) {
  const mio = useRef<HTMLButtonElement>(null);

  // La card scelta si riporta in vista da sola: scegliendo «Vodka» in fondo
  // alla barra e poi tornando, senza questo la selezione resterebbe fuori
  // schermo e sembrerebbe che nessun filtro sia attivo.
  useEffect(() => {
    if (attiva) mio.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [attiva]);

  return (
    <button
      ref={mio}
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={`focus-visible:ring-brand-600 flex w-[5.75rem] shrink-0 cursor-pointer snap-start flex-col items-center gap-1.5 rounded-[1.25rem] border px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none ${
        attiva
          ? 'border-brand-500 bg-brand-50'
          : 'border-neutral-200 bg-white hover:border-neutral-300 active:bg-neutral-50'
      }`}
    >
      {/* Il disegno dentro una pastiglia col fondo della sua famiglia: è
          quello che si vede per primo scorrendo, e senza fondo un tratto
          sottile su bianco a questa misura sparisce. */}
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
          attiva ? 'bg-white' : sfondo
        }`}
      >
        {disegno}
      </span>
      <span
        className={`line-clamp-2 text-center text-[13px] leading-4 font-semibold ${
          attiva ? 'text-brand-900' : 'text-neutral-700'
        }`}
      >
        {nome}
      </span>
      <span
        className={`tabellare text-[11px] leading-none ${
          attiva ? 'text-brand-600' : 'text-neutral-400'
        }`}
      >
        {quanti}
      </span>
    </button>
  );
}

export function CategoryRail({
  categorie,
  scelta,
  totale,
  onScegli,
}: {
  categorie: Gruppo[];
  scelta: string | null;
  /** Quanti prodotti in tutto: il numero sulla card «Tutte». */
  totale: number;
  onScegli: (id: string | null) => void;
}) {
  if (categorie.length <= 1) return null;

  return (
    <div
      className="scrollbar-none -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-0.5 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
      role="group"
      aria-label="Filtra per categoria"
    >
      <Card
        attiva={scelta === null}
        nome="Tutte"
        quanti={totale}
        sfondo="bg-neutral-100"
        onClick={() => onScegli(null)}
        disegno={
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-7 w-7 text-neutral-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3.6" y="3.6" width="7" height="7" rx="2" />
            <rect x="13.4" y="3.6" width="7" height="7" rx="2" />
            <rect x="3.6" y="13.4" width="7" height="7" rx="2" />
            <rect x="13.4" y="13.4" width="7" height="7" rx="2" />
          </svg>
        }
      />
      {categorie.map((c) => {
        const v = visualeCategoria(c.nome);
        return (
          <Card
            key={c.id}
            attiva={scelta === c.id}
            nome={c.nome}
            quanti={c.quanti}
            sfondo={v.sfondo}
            onClick={() => onScegli(scelta === c.id ? null : c.id)}
            disegno={
              <span className={v.accento}>
                <DisegnoCategoria genere={v.genere} className="h-7 w-7" />
              </span>
            }
          />
        );
      })}
    </div>
  );
}
