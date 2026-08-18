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
  | 'distillato'
  | 'cocktail'
  | 'amaro'
  | 'vino'
  | 'spumante'
  | 'birra'
  | 'lattina'
  | 'succo'
  | 'caffe'
  | 'sciroppo'
  | 'gelato'
  | 'snack'
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
  { prova: /vino|rosso|bianc|ros[eé]|igt|doc\b|docg|passit|vermut|vermouth/, genere: 'vino' },
  { prova: /birr|beer|ipa\b|lager|weiss|stout/, genere: 'birra' },
  { prova: /acqua|water|minerale/, genere: 'acqua' },
  { prova: /caff|caffe|ciald|capsul|t[eè]\b|the\b|tisan|infus/, genere: 'caffe' },
  { prova: /gelat|cono|coppett|granit|topping|cialde/, genere: 'gelato' },
  { prova: /sciropp|syrup|purea|concentrat/, genere: 'sciroppo' },
  { prova: /succ|nettare|frutt|smoothie|spremut/, genere: 'succo' },
  {
    prova: /bibit|cola|energy|aranciat|gassos|soda|tonic|lattin|analcolic|alcol free|zero\b/,
    genere: 'lattina',
  },
  { prova: /amaro|amari|bitter|aperitiv|digestiv/, genere: 'amaro' },
  { prova: /gin\b|cocktail|mixer|premiscel/, genere: 'cocktail' },
  {
    prova:
      /vodka|rum\b|whisk|tequila|mezcal|grappa|brandy|cognac|liquor|distillat|sambuc|anice|limoncell/,
    genere: 'distillato',
  },
  { prova: /snack|patatin|salatin|biscott|merend|dolcium|cioccolat/, genere: 'snack' },
  { prova: /bicchier|tovagli|cannucc|monouso|attrezz|material/, genere: 'altro' },
];

const COLORI: Record<GenereProdotto, { accento: string; sfondo: string }> = {
  acqua: { accento: 'text-sky-500', sfondo: 'bg-sky-50' },
  distillato: { accento: 'text-violet-500', sfondo: 'bg-violet-50' },
  cocktail: { accento: 'text-teal-500', sfondo: 'bg-teal-50' },
  amaro: { accento: 'text-amber-600', sfondo: 'bg-amber-50' },
  vino: { accento: 'text-rose-500', sfondo: 'bg-rose-50' },
  spumante: { accento: 'text-yellow-500', sfondo: 'bg-yellow-50' },
  birra: { accento: 'text-orange-500', sfondo: 'bg-orange-50' },
  lattina: { accento: 'text-red-500', sfondo: 'bg-red-50' },
  succo: { accento: 'text-orange-400', sfondo: 'bg-orange-50' },
  caffe: { accento: 'text-stone-500', sfondo: 'bg-stone-100' },
  sciroppo: { accento: 'text-fuchsia-500', sfondo: 'bg-fuchsia-50' },
  gelato: { accento: 'text-pink-400', sfondo: 'bg-pink-50' },
  snack: { accento: 'text-lime-600', sfondo: 'bg-lime-50' },
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
      {genere === 'distillato' && (
        <>
          <path d="M10 2.8h4v3.4l2.4 3.6V20a1.2 1.2 0 0 1-1.2 1.2H8.8A1.2 1.2 0 0 1 7.6 20V9.8L10 6.2V2.8Z" />
          <path d="M7.6 13.5h8.8" />
        </>
      )}
      {genere === 'cocktail' && (
        <>
          <path d="M3.8 5h16.4L12 13.2 3.8 5Z" />
          <path d="M12 13.2V20M8.5 20h7M17 3l1.8 1.4" />
        </>
      )}
      {genere === 'amaro' && (
        <>
          <path d="M6.6 6h10.8l-1.3 7.2a4.2 4.2 0 0 1-8.2 0L6.6 6Z" />
          <path d="M12 17.4V21M8.8 21h6.4M6.6 9.2h10.8" />
        </>
      )}
      {genere === 'vino' && (
        <>
          <path d="M7.2 3h9.6v4.2a4.8 4.8 0 0 1-9.6 0V3Z" />
          <path d="M12 12v7M8.6 19h6.8M7.2 6.6h9.6" />
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
      {genere === 'succo' && (
        <>
          <path d="M6.6 7h10l-1 12.4a1.6 1.6 0 0 1-1.6 1.5h-4.8a1.6 1.6 0 0 1-1.6-1.5L6.6 7Z" />
          <path d="M7 11.6h9.2M14.4 7l2.6-4" />
        </>
      )}
      {genere === 'caffe' && (
        <>
          <path d="M4.6 9.4h12.2v6.2a5 5 0 0 1-5 5h-2.2a5 5 0 0 1-5-5V9.4Z" />
          <path d="M16.8 11.2h1.8a2.4 2.4 0 0 1 0 4.8h-1.8" />
          <path d="M8.6 6.2V4M12 6.2V4M3.4 21h14.6" />
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
