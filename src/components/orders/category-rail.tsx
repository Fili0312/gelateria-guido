'use client';

import { useEffect, useRef } from 'react';
import { genereDa } from '@/components/products/foto-prodotto';
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
 * ── Il conteggio dentro, non accanto ────────────────────────────────────
 * Dice quanto c'è **prima** di premere. Una categoria vuota non compare
 * proprio: un filtro che porta a zero risultati è un filtro che non doveva
 * esserci.
 */

function Disegno({ nome }: { nome: string }) {
  const genere = genereDa(nome);
  const comune = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 24 32" aria-hidden className="h-8 w-8" {...comune}>
      {genere === 'bottiglia' && (
        <>
          <path d="M10 3h4v5.5l3 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 28V13l3-4.5V3Z" />
          <path d="M7 18h10" />
        </>
      )}
      {genere === 'acqua' && (
        <>
          <path d="M10 3h4v4l2.5 3.5V28a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 28V10.5L10 7V3Z" />
          <path d="M7.5 15h9M7.5 20h9" />
        </>
      )}
      {genere === 'lattina' && (
        <>
          <path d="M8 5h8v22a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5Z" />
          <path d="M8 5c0-1.1 1.8-2 4-2s4 .9 4 2M8 10h8" />
        </>
      )}
      {genere === 'caffe' && (
        <>
          <path d="M5 11h13v9a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-9Z" />
          <path d="M18 13h1.5a2.5 2.5 0 0 1 0 5H18M9 7V5M13 7V5" />
        </>
      )}
      {genere === 'scatola' && (
        <>
          <path d="M4 10.5 12 7l8 3.5v11L12 25l-8-3.5v-11Z" />
          <path d="M4 10.5 12 14l8-3.5M12 14v11" />
        </>
      )}
    </svg>
  );
}

function Card({
  attiva,
  nome,
  quanti,
  disegno,
  onClick,
}: {
  attiva: boolean;
  nome: string;
  quanti: number;
  disegno: React.ReactNode;
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
      className={`flex w-[6.5rem] shrink-0 cursor-pointer snap-start flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none ${
        attiva
          ? 'border-brand-600 bg-brand-50 text-brand-900'
          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 active:bg-neutral-50'
      }`}
    >
      <span className={attiva ? 'text-brand-600' : 'text-neutral-400'}>{disegno}</span>
      <span
        className={`line-clamp-2 text-center text-[13px] leading-4 ${
          attiva ? 'font-bold' : 'font-semibold text-neutral-800'
        }`}
      >
        {nome}
      </span>
      <span className={`tabellare text-xs ${attiva ? 'text-brand-700' : 'text-neutral-400'}`}>
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
      className="scrollbar-none -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
      role="group"
      aria-label="Filtra per categoria"
    >
      <Card
        attiva={scelta === null}
        nome="Tutte le categorie"
        quanti={totale}
        onClick={() => onScegli(null)}
        disegno={
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
          </svg>
        }
      />
      {categorie.map((c) => (
        <Card
          key={c.id}
          attiva={scelta === c.id}
          nome={c.nome}
          quanti={c.quanti}
          onClick={() => onScegli(scelta === c.id ? null : c.id)}
          disegno={<Disegno nome={c.nome} />}
        />
      ))}
    </div>
  );
}
