'use client';

import { useState } from 'react';

/**
 * La foto di un prodotto, o un segnaposto che non finge di esserlo.
 *
 * ── Tre stati, non uno ──────────────────────────────────────────────────
 * «Nessuna foto», «foto che sta arrivando» e «foto che non si carica» sono
 * cose diverse e finiscono tutte e tre nello stesso posto della card. Il
 * riquadro tiene la **stessa misura** in tutti e tre i casi: se cambiasse,
 * l'elenco si riassesterebbe mentre le immagini arrivano e il dito
 * premerebbe la riga sbagliata.
 *
 * ── `contain`, non `cover` ──────────────────────────────────────────────
 * Le bottiglie sono alte e strette, le lattine tozze, i cartoni quadrati.
 * `cover` riempirebbe il riquadro tagliando: di una bottiglia si vedrebbe
 * il centro dell'etichetta e non la sagoma, che è proprio ciò che si
 * riconosce scorrendo.
 */

export type GenereProdotto = 'acqua' | 'bottiglia' | 'lattina' | 'caffe' | 'scatola';

/**
 * Che disegno mettere quando la foto non c'è.
 *
 * Dalla categoria, che è un dato nostro e affidabile — non dalla foto, che è
 * quella che manca. Un'icona che dice «bottiglia» accanto a «Amaro
 * Montenegro» comunica comunque qualcosa; un rettangolo grigio no.
 */
export function genereDa(categoria: string | null | undefined): GenereProdotto {
  const c = (categoria ?? '').toLowerCase();
  if (/acqua|water/.test(c)) return 'acqua';
  if (/caff|caffe|tè|the\b|tisan/.test(c)) return 'caffe';
  if (/bibit|cola|energy|lattin|birra/.test(c)) return 'lattina';
  if (
    /amaro|liquor|vodka|gin|rum|whisky|grappa|vino|spuman|bitter|sciroppo|succo|tequila|distillat|analcolic/.test(
      c,
    )
  ) {
    return 'bottiglia';
  }
  return 'scatola';
}

function Disegno({ genere }: { genere: GenereProdotto }) {
  const comune = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 24 32" aria-hidden className="h-3/5 w-3/5 text-neutral-300" {...comune}>
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

export function FotoProdotto({
  src,
  nome,
  categoria,
  className = '',
}: {
  /** `null` quando la foto non è (ancora) stata trovata. */
  src: string | null;
  nome: string;
  categoria: string | null | undefined;
  className?: string;
}) {
  const [rotta, setRotta] = useState(false);
  const genere = genereDa(categoria);
  const mostraFoto = src !== null && !rotta;

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-xl bg-neutral-50 ${className}`}
    >
      {mostraFoto ? (
        // `alt` vuoto e non il nome del prodotto: il nome è già scritto
        // accanto, in grande. Ripeterlo qui farebbe leggere due volte la
        // stessa cosa a chi usa uno screen reader, senza aggiungere niente.
        // `next/image` qui non serve e non funzionerebbe: la foto è già una
        // miniatura da 200 px salvata da noi, e l'ottimizzatore di Next
        // dovrebbe riscaricarla dalla nostra rotta — che è protetta da
        // sessione, e a lui la sessione non arriva.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setRotta(true)}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <Disegno genere={genere} />
      )}
      {/* Detto una volta sola, per chi non vede il riquadro. */}
      {!mostraFoto && <span className="sr-only">Nessuna foto per {nome}</span>}
    </span>
  );
}
