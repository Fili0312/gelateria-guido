/**
 * Che faccia ha una categoria: disegno e colore, decisi in un posto solo.
 *
 * ── Perché sta tutto qui ────────────────────────────────────────────────
 * Il disegno serve in due punti lontani — le card dei filtri in cima e il
 * segnaposto dentro la card prodotto — e devono per forza combaciare: se
 * «Amaro» ha un bicchiere nel filtro e una bottiglia nella card, non si
 * capisce che sono la stessa cosa. Con la regola scritta due volte
 * combaciano finché qualcuno non tocca una delle due.
 *
 * ── Perché ogni famiglia ha il suo disegno e non una bottiglia sola ─────
 * Prima acqua, amaro, vodka e gin avevano tutti la stessa sagoma grigia: in
 * una barra che scorre erano quattro rettangoli identici, e per distinguerli
 * bisognava leggere il nome — cioè fare esattamente la cosa che l'icona
 * dovrebbe risparmiare. Un calice, un boccale e una lattina si riconoscono
 * di sguardo anche capovolti.
 *
 * ── Il colore ───────────────────────────────────────────────────────────
 * Un accento tenue per famiglia, non una tavolozza. Serve a separare
 * l'acqua dal vino rosso mentre il pollice scorre; se ogni categoria avesse
 * un colore acceso tutto sarebbe acceso, e non risalterebbe più niente —
 * meno che mai il verde, che qui vuol dire «premi qui».
 */

export type GenereProdotto =
  | 'acqua'
  | 'vodka'
  | 'gin'
  | 'ambrato'
  | 'grappa'
  | 'liquore'
  | 'amaro'
  | 'aperitivo'
  | 'vino'
  | 'spumante'
  | 'birra'
  | 'lattina'
  | 'succo'
  | 'caffe'
  | 'the'
  | 'sciroppo'
  | 'gelato'
  | 'snack'
  | 'dispensa'
  | 'fusto'
  | 'frutta'
  | 'monouso'
  | 'altro';

export interface VisualeCategoria {
  genere: GenereProdotto;
  /** Il colore del disegno. */
  accento: string;
  /** Il fondo tenue dietro al disegno. */
  sfondo: string;
}

/**
 * Dal nome della categoria alla sua faccia.
 *
 * Una tabella di parole, letta dalla più specifica alla più generica:
 * l'ordine conta, perché «spumante brut» contiene «brut» ma anche «vino
 * spumante» contiene «vino», e chi arriva prima vince. Le voci specifiche
 * stanno quindi sopra.
 */
const TABELLA: { prova: RegExp; genere: GenereProdotto }[] = [
  { prova: /spumant|prosecc|champagn|franciacort|brut|metodo classico/, genere: 'spumante' },
  { prova: /vermouth|vermut|aperitiv|bitter|spritz|punch/, genere: 'aperitivo' },
  { prova: /vino|rosso|bianc|ros[eé]|igt|docg|doc\b|passit/, genere: 'vino' },
  { prova: /birr|beer|ipa\b|lager|weiss|stout/, genere: 'birra' },
  { prova: /acqua|water|minerale/, genere: 'acqua' },
  { prova: /t[eè]\b|the\b|tisan|infus|camomill/, genere: 'the' },
  { prova: /caff|caffe|ciald|capsul/, genere: 'caffe' },
  { prova: /gelat|cono|coppett|granit|topping|cialde/, genere: 'gelato' },
  { prova: /sciropp|syrup|purea|concentrat/, genere: 'sciroppo' },
  { prova: /succ|nettare|smoothie|spremut/, genere: 'succo' },
  { prova: /frutt|agrum|lime|limone/, genere: 'frutta' },
  { prova: /fusti|fusto|keg|spina/, genere: 'fusto' },
  {
    prova: /bibit|cola|energy|aranciat|gassos|soda|tonic|lattin|analcolic|alcol free/,
    genere: 'lattina',
  },
  { prova: /amaro|amari|digestiv|china\b|fernet/, genere: 'amaro' },
  { prova: /grappa|acquavit|distillat d/, genere: 'grappa' },
  { prova: /whisk|bourbon|scotch|rum\b|brandy|cognac|armagnac|tequila|mezcal/, genere: 'ambrato' },
  { prova: /gin\b|cocktail|mixer|premiscel/, genere: 'gin' },
  { prova: /vodka/, genere: 'vodka' },
  { prova: /liquor|crema|sambuc|anice|limoncell|alchermes|maraschin/, genere: 'liquore' },
  { prova: /snack|patatin|salatin|biscott|merend|dolcium|cioccolat/, genere: 'snack' },
  { prova: /zucchero|sale\b|olio|farin|dispens|conserv/, genere: 'dispensa' },
  { prova: /bicchier|tovagli|cannucc|monouso|palett|piatt/, genere: 'monouso' },
];

const COLORI: Record<GenereProdotto, { accento: string; sfondo: string }> = {
  acqua: { accento: 'text-sky-500', sfondo: 'bg-sky-50' },
  vodka: { accento: 'text-slate-500', sfondo: 'bg-slate-100' },
  gin: { accento: 'text-teal-500', sfondo: 'bg-teal-50' },
  ambrato: { accento: 'text-amber-700', sfondo: 'bg-amber-50' },
  grappa: { accento: 'text-emerald-600', sfondo: 'bg-emerald-50' },
  liquore: { accento: 'text-violet-500', sfondo: 'bg-violet-50' },
  amaro: { accento: 'text-orange-700', sfondo: 'bg-orange-50' },
  aperitivo: { accento: 'text-red-400', sfondo: 'bg-red-50' },
  vino: { accento: 'text-rose-600', sfondo: 'bg-rose-50' },
  spumante: { accento: 'text-yellow-500', sfondo: 'bg-yellow-50' },
  birra: { accento: 'text-amber-500', sfondo: 'bg-amber-50' },
  lattina: { accento: 'text-red-500', sfondo: 'bg-red-50' },
  succo: { accento: 'text-orange-400', sfondo: 'bg-orange-50' },
  caffe: { accento: 'text-stone-500', sfondo: 'bg-stone-100' },
  the: { accento: 'text-lime-600', sfondo: 'bg-lime-50' },
  sciroppo: { accento: 'text-fuchsia-500', sfondo: 'bg-fuchsia-50' },
  gelato: { accento: 'text-pink-400', sfondo: 'bg-pink-50' },
  snack: { accento: 'text-yellow-600', sfondo: 'bg-yellow-50' },
  dispensa: { accento: 'text-stone-400', sfondo: 'bg-stone-100' },
  fusto: { accento: 'text-zinc-500', sfondo: 'bg-zinc-100' },
  frutta: { accento: 'text-green-500', sfondo: 'bg-green-50' },
  monouso: { accento: 'text-cyan-600', sfondo: 'bg-cyan-50' },
  altro: { accento: 'text-neutral-400', sfondo: 'bg-neutral-100' },
};

export function visualeCategoria(nome: string | null | undefined): VisualeCategoria {
  const testo = (nome ?? '').toLowerCase();
  const genere = TABELLA.find((voce) => voce.prova.test(testo))?.genere ?? 'altro';
  return { genere, ...COLORI[genere] };
}

/**
 * Il disegno, in un riquadro quadrato.
 *
 * Tratto pieno e non contorno sottile: nella barra dei filtri i disegni sono
 * alti trenta pixel, e a quella misura un contorno da un pixel e mezzo
 * sparisce. Le sagome sono volutamente semplici — si guardano di sfuggita,
 * non si studiano.
 */
export function DisegnoCategoria({
  genere,
  className = 'h-7 w-7',
}: {
  genere: GenereProdotto;
  className?: string;
}) {
  const t = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...t}>
      {genere === 'acqua' && (
        <path d="M12 3.2c3.6 4.3 5.6 7.2 5.6 9.7A5.6 5.6 0 0 1 12 18.5a5.6 5.6 0 0 1-5.6-5.6c0-2.5 2-5.4 5.6-9.7Z" />
      )}
      {/* Vodka: bottiglia slanciata, collo lungo, spalla netta. */}
      {genere === 'vodka' && (
        <>
          <path d="M10.4 2.6h3.2v4.2l1.9 2.8V20a1.4 1.4 0 0 1-1.4 1.4H9.9A1.4 1.4 0 0 1 8.5 20V9.6l1.9-2.8V2.6Z" />
          <path d="M8.5 12.8h7" />
        </>
      )}
      {/* Gin: la bacca di ginepro sopra il calice. */}
      {genere === 'gin' && (
        <>
          <path d="M4.4 6h15.2L12 14 4.4 6Z" />
          <path d="M12 14v6.4M8.8 20.4h6.4" />
          <circle cx="17.4" cy="3.4" r="1.5" />
        </>
      )}
      {/* Whisky, rum, brandy: il bicchiere basso col cubetto. */}
      {genere === 'ambrato' && (
        <>
          <path d="M6 6.6h12l-1 12.2a2 2 0 0 1-2 1.8H9a2 2 0 0 1-2-1.8L6 6.6Z" />
          <path d="m9.6 12.6 2.6-2.2 2.4 2.2-2.4 2.4-2.6-2.4Z" />
        </>
      )}
      {/* Grappa: la bottiglia stretta e alta del distillato d'uva. */}
      {genere === 'grappa' && (
        <>
          <path d="M11 2.6h2v6.2l2.1 3.1V20a1.4 1.4 0 0 1-1.4 1.4h-3.4A1.4 1.4 0 0 1 8.9 20v-8.1L11 8.8V2.6Z" />
          <path d="M10.2 4.6h3.6" />
        </>
      )}
      {/* Liquore: bottiglia panciuta e bassa. */}
      {genere === 'liquore' && (
        <>
          <path d="M10.6 2.8h2.8v3.4c2.4 1 3.8 2.8 3.8 5.2V19a2.4 2.4 0 0 1-2.4 2.4H9.2A2.4 2.4 0 0 1 6.8 19v-7.6c0-2.4 1.4-4.2 3.8-5.2V2.8Z" />
          <path d="M6.8 14h10.4" />
        </>
      )}
      {/* Amaro: il calice da digestivo, stretto e alto sullo stelo. */}
      {genere === 'amaro' && (
        <>
          <path d="M7.4 4.4h9.2l-1.5 8.4a3.2 3.2 0 0 1-6.2 0L7.4 4.4Z" />
          <path d="M12 15.6V21M9 21h6M7.9 8h8.2" />
        </>
      )}
      {/* Aperitivo: il calice largo con la fetta d'arancia. */}
      {genere === 'aperitivo' && (
        <>
          <path d="M5.6 5.4h12.8l-2.6 7.4a4.4 4.4 0 0 1-7.6 0L5.6 5.4Z" />
          <path d="M12 15v5.4M9 20.4h6" />
          <path d="M17.6 8.6a2.4 2.4 0 1 0 0 4.8" />
        </>
      )}
      {genere === 'vino' && (
        <>
          <path d="M7.4 3h9.2v4a4.6 4.6 0 0 1-9.2 0V3Z" />
          <path d="M12 11.8V20M8.8 20h6.4M7.4 6.4h9.2" />
        </>
      )}
      {genere === 'spumante' && (
        <>
          <path d="M9.6 2.6h4.8v3.1l1.7 2.6c.5.8.7 1.6.7 2.5V20a1.3 1.3 0 0 1-1.3 1.3H8.5A1.3 1.3 0 0 1 7.2 20V10.8c0-.9.2-1.7.7-2.5l1.7-2.6V2.6Z" />
          <path d="M7.2 11.4h9.6M9.6 5.2h4.8" />
        </>
      )}
      {genere === 'birra' && (
        <>
          <path d="M6 8.4h9.4V21H6V8.4Z" />
          <path d="M15.4 10.6h2.3a1.9 1.9 0 0 1 0 3.8h-2.3" />
          <path d="M6 8.4c0-1.9 1.3-3 2.8-3 .3-1.4 1.4-2.2 2.8-2.2s2.5.8 2.8 2.2c1 .2 1.6 1.2 1 2.2" />
          <path d="M9 11.6v6M12.4 11.6v6" />
        </>
      )}
      {genere === 'lattina' && (
        <>
          <path d="M7.6 5.4h8.8v13.4a2.2 2.2 0 0 1-2.2 2.2H9.8a2.2 2.2 0 0 1-2.2-2.2V5.4Z" />
          <path d="M7.6 5.4c0-1.1 2-2 4.4-2s4.4.9 4.4 2M7.6 9.6h8.8" />
        </>
      )}
      {/* Succo: il bicchiere con la cannuccia. */}
      {genere === 'succo' && (
        <>
          <path d="M6.8 7.6h10.4l-1.1 12a1.6 1.6 0 0 1-1.6 1.4H9.5a1.6 1.6 0 0 1-1.6-1.4l-1.1-12Z" />
          <path d="M7.2 11.6h9.6M13.6 7.6l3-4.4" />
        </>
      )}
      {genere === 'caffe' && (
        <>
          <path d="M4.6 9.4h12.2v6.2a5 5 0 0 1-5 5h-2.2a5 5 0 0 1-5-5V9.4Z" />
          <path d="M16.8 11.2h1.8a2.4 2.4 0 0 1 0 4.8h-1.8" />
          <path d="M8.6 6.2V4M12 6.2V4M3.4 21h14.6" />
        </>
      )}
      {/* Tè: la tazza con l'etichetta della bustina. */}
      {genere === 'the' && (
        <>
          <path d="M4.6 9.6h11.2v5.8a5 5 0 0 1-5 5H9.6a5 5 0 0 1-5-5V9.6Z" />
          <path d="M15.8 11.4h1.6a2.3 2.3 0 0 1 0 4.6h-1.6" />
          <path d="M10.2 9.6V6.2h3.4v2.2" />
        </>
      )}
      {genere === 'sciroppo' && (
        <>
          <path d="M8.8 8h6.4a1.6 1.6 0 0 1 1.6 1.6v10a1.6 1.6 0 0 1-1.6 1.6H8.8a1.6 1.6 0 0 1-1.6-1.6v-10A1.6 1.6 0 0 1 8.8 8Z" />
          <path d="M10.4 8V4.6h3.2V8M7.2 12.4h9.6" />
        </>
      )}
      {genere === 'gelato' && (
        <>
          <path d="M8 10.6 12 21l4-10.4" />
          <path d="M12 3a4.6 4.6 0 0 0-4.4 6.1c-.1.6.3 1.1.9 1.1h7a.9.9 0 0 0 .9-1.1A4.6 4.6 0 0 0 12 3Z" />
        </>
      )}
      {genere === 'snack' && (
        <>
          <path d="M5 8.2h14v9.6H5V8.2Z" />
          <path d="m5 8.2-2-2.6 3.4.6M19 8.2l2-2.6-3.4.6M5 17.8l-2 2.6 3.4-.6M19 17.8l2 2.6-3.4-.6" />
        </>
      )}
      {/* Dispensa: il barattolo di sale, zucchero, olio. */}
      {genere === 'dispensa' && (
        <>
          <path d="M6.8 8.4h10.4V19a2.4 2.4 0 0 1-2.4 2.4H9.2A2.4 2.4 0 0 1 6.8 19V8.4Z" />
          <path d="M8.4 8.4V5.6a1.6 1.6 0 0 1 1.6-1.6h4a1.6 1.6 0 0 1 1.6 1.6v2.8M6.8 12.2h10.4" />
        </>
      )}
      {/* Fusto: la birra alla spina. */}
      {genere === 'fusto' && (
        <>
          <path d="M7 4.6h10v14.8H7V4.6Z" />
          <path d="M5.6 4.6h12.8M5.6 19.4h12.8M7 9h10M7 15h10" />
        </>
      )}
      {genere === 'frutta' && (
        <>
          <path d="M12 7.4c-1-1.2-3.6-1.6-5 .4-1.6 2.2-.6 7 1.6 9.8 1 1.3 2.2 1.6 3.4 1.1 1.2.5 2.4.2 3.4-1.1 2.2-2.8 3.2-7.6 1.6-9.8-1.4-2-4-1.6-5-.4Z" />
          <path d="M12 7.4V4.6M12 4.6c1.4 0 2.4-1 2.4-2.2" />
        </>
      )}
      {/* Monouso: il bicchiere di carta con la cannuccia. */}
      {genere === 'monouso' && (
        <>
          <path d="M7 8.6h10l-1.2 11a1.8 1.8 0 0 1-1.8 1.6H10a1.8 1.8 0 0 1-1.8-1.6L7 8.6Z" />
          <path d="M5.8 8.6h12.4M13.4 8.6l2.4-5.4" />
        </>
      )}
      {genere === 'altro' && (
        <>
          <path d="M4 8.6 12 5l8 3.6v7L12 19l-8-3.5v-7Z" />
          <path d="M4 8.6 12 12l8-3.4M12 12v7" />
        </>
      )}
    </svg>
  );
}

/** Il disegno con il suo colore, già pronto. Usato ovunque serva. */
export function IconaCategoria({
  categoria,
  className,
}: {
  categoria: string | null | undefined;
  className?: string;
}) {
  const v = visualeCategoria(categoria);
  return (
    <span className={v.accento}>
      <DisegnoCategoria genere={v.genere} className={className} />
    </span>
  );
}
