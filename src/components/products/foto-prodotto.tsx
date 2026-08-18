'use client';

import { useState } from 'react';
import { DisegnoCategoria, visualeCategoria } from './categoria-visuale';

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
 *
 * L'ingrandimento del 22% serve perché le foto dei cataloghi arrivano quasi
 * sempre con un bordo bianco attorno al prodotto: `contain` rispetta quel
 * bordo e la bottiglia finisce a galleggiare piccola in mezzo al riquadro.
 * Il riquadro ritaglia, quindi l'ingrandimento non esce dalla card: mangia
 * il bianco, e su una bottiglia molto stretta al massimo sfiora il tappo.
 */

/**
 * Che disegno mettere quando la foto non c'è.
 *
 * Dalla categoria, che è un dato nostro e affidabile — non dalla foto, che è
 * quella che manca. Un calice accanto a «Nero d'Avola» comunica comunque
 * qualcosa; un rettangolo grigio no. La scelta del disegno e del colore sta
 * in `categoria-visuale.tsx`, insieme a quella delle card dei filtri: se
 * fosse scritta due volte, prima o poi «Amaro» avrebbe un bicchiere in cima
 * alla pagina e una bottiglia dentro la card.
 */

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
  const visuale = visualeCategoria(categoria);
  const mostraFoto = src !== null && !rotta;

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-2xl ${
        // Senza foto il riquadro prende il fondo tenue della famiglia: un
        // quadrato grigio con dentro una sagoma minuscola sembrava un errore
        // di caricamento, mentre un fondo colorato si legge come una scelta.
        mostraFoto ? 'bg-white' : visuale.sfondo
      } ${className}`}
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
          className="h-full w-full scale-[1.22] object-contain object-center"
        />
      ) : (
        // Grande: riempie i due terzi del riquadro invece di galleggiarci
        // dentro. Una sagoma piccola in un quadrato vuoto sembra una foto
        // che non è arrivata; una sagoma piena sembra un'illustrazione.
        <span className={visuale.accento}>
          <DisegnoCategoria genere={visuale.genere} className="h-11 w-11" />
        </span>
      )}
      {/* Detto una volta sola, per chi non vede il riquadro. */}
      {!mostraFoto && <span className="sr-only">Nessuna foto per {nome}</span>}
    </span>
  );
}
