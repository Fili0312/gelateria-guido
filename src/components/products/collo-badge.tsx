import { descriviCollo, type ConfezioneDaDescrivere } from '@/features/products/packaging';

/**
 * Cosa arriva comprandone una: un collo da ventiquattro, o una bottiglia.
 *
 * È la stessa etichetta ovunque — catalogo, schermata d'ordine, confronti —
 * perché è la stessa domanda: **questo prezzo si riferisce a cosa?** Averla
 * scritta in tre modi diversi su tre schermate obbligava a rileggerla ogni
 * volta invece di riconoscerla.
 *
 * Il colore distingue le tre situazioni, ma non le distingue **solo** il
 * colore: la parola c'è sempre, perché chi non vede bene i colori deve poter
 * capire lo stesso, e perché su una stampa in bianco e nero resta tutto.
 *
 *  - grigio — una confezione singola: il prezzo è quello del pezzo;
 *  - blu — un collo: il prezzo è di tutta la cassa, e sono N pezzi;
 *  - ambra — i pezzi non si sanno, quindi il prezzo unitario non si può fare.
 *    È l'unico che chiede qualcosa, e infatti è l'unico che si preme.
 */
export function ColloBadge({
  confezione,
  onDefinisci,
  className = '',
}: {
  confezione: ConfezioneDaDescrivere;
  /** Se c'è, l'etichetta «da definire» diventa il pulsante per rimediare. */
  onDefinisci?: React.ReactNode;
  className?: string;
}) {
  const collo = descriviCollo(confezione);

  if (collo.daDefinire && onDefinisci) return <>{onDefinisci}</>;

  const tono = collo.daDefinire
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : collo.singolo
      ? 'border-neutral-200 bg-neutral-50 text-neutral-600'
      : 'border-sky-200 bg-sky-50 text-sky-800';

  return (
    <span className={`inline-flex items-baseline gap-1.5 text-xs ${className}`}>
      <span className={`rounded-md border px-1.5 py-0.5 text-xs leading-4 font-semibold ${tono}`}>
        {collo.titolo}
      </span>
      {collo.dettaglio && <span className="text-neutral-500">{collo.dettaglio}</span>}
    </span>
  );
}

/** «alla» davanti a vocale si elide: «all'unità», non «alla unità». */
function alla(nome: string): string {
  return /^[aeiou]/i.test(nome) ? `all’${nome}` : `alla ${nome}`;
}

/** «al collo» / «all'unità» / «alla bottiglia»: a cosa si riferisce il prezzo. */
export function aCosaSiRiferisce(confezione: ConfezioneDaDescrivere): string {
  const collo = descriviCollo(confezione);
  if (collo.daDefinire) return 'alla confezione';
  if (collo.singolo) {
    // «1 bottiglia» → «alla bottiglia». Se il listino non dà un nome, resta
    // il generico: inventarne uno sarebbe peggio di non dirlo.
    const nome = collo.titolo.replace(/^1 /, '');
    return nome === 'Confezione singola' ? 'alla confezione' : alla(nome);
  }
  return `al ${collo.titolo.split(' ')[0]!.toLowerCase()}`;
}
