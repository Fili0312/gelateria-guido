import { etichettaImballo, formatoUnitario } from './format';
import type { UnitOfMeasureValue } from './schema';

/**
 * Come si dice, in italiano, cosa si sta comprando.
 *
 * «4,72 €» da solo non dice niente. Sono 4,72 € per una bottiglia da mezzo
 * litro o per un collo da ventiquattro? Le due letture differiscono di
 * ventiquattro volte, e chi ordina se ne accorge alla consegna, quando
 * arrivano ventiquattro casse invece di ventiquattro bottiglie.
 *
 * Il listino i dati ce li dà quasi sempre: la sigla dell'imballo (`BT`, `CO`,
 * `CT`) e i pezzi per confezione. Erano nel database e non si vedevano da
 * nessuna parte, tranne come «collo · 50 cl» — che dice il tipo ma non
 * quanti.
 *
 * ── Non si inventa il nome del contenuto ────────────────────────────────
 * Un `CO 24` dice che è un collo da ventiquattro pezzi; **non** dice che sono
 * bottiglie. Su un listino di liquori quasi sempre lo sono, su uno di
 * cialde no. Quindi «Collo da 24» e, accanto, il formato del singolo pezzo —
 * `70 cl l'uno` — che è l'informazione che serve davvero a capire cosa arriva.
 * Il nome del pezzo si dice solo quando è il listino a dirlo: `BT` significa
 * bottiglia, e allora si scrive bottiglia.
 */

export interface ConfezioneDaDescrivere {
  packagingType: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
}

export interface Collo {
  /** La riga principale: «Collo da 24», «1 bottiglia», «Pezzi da definire». */
  titolo: string;
  /** Il formato del singolo pezzo: «70 cl l'uno», oppure «70 cl» se è uno solo. */
  dettaglio: string | null;
  /** Quanti pezzi arrivano comprandone una. */
  pezzi: number;
  /** `true` quando i pezzi non sono confermati: il prezzo unitario non si sa. */
  daDefinire: boolean;
  /** `true` quando comprandone una arriva un pezzo solo. */
  singolo: boolean;
}

/**
 * Le sigle che indicano un **contenitore di più pezzi**, non il pezzo.
 *
 * Serve a scegliere la parola: un `CO` da ventiquattro è «un collo da 24», un
 * `BT` da ventiquattro sarebbe una scrittura strana del listino e diventa
 * «confezione da 24», che è vero senza pretendere di sapere cosa sia.
 */
const CONTENITORI = new Set(['CO', 'CT', 'SC', 'CR', 'FU', 'CF', 'BU', 'SH']);

/** Il nome del singolo pezzo, ma solo quando è il listino a dirlo. */
function nomeDelPezzo(packagingType: string | null): string | null {
  const sigla = packagingType?.trim().toUpperCase();
  if (!sigla || CONTENITORI.has(sigla)) return null;
  return etichettaImballo(packagingType);
}

/**
 * Un contenitore che dichiara **un pezzo solo** si contraddice: un collo da
 * un pezzo non esiste. Vuol dire che il numero non è stato letto dal listino.
 *
 * Vale a prescindere dal flag `packQuantityConfirmed`, che è
 * un'annotazione nostra e può mancare — per esempio negli snapshot di un
 * ordine, che congelano cosa si è comprato e non i nostri dubbi. La
 * contraddizione invece sta nel dato, e si vede sempre.
 */
function contenitoreSenzaConto(c: ConfezioneDaDescrivere): boolean {
  const sigla = c.packagingType?.trim().toUpperCase();
  return Boolean(sigla && CONTENITORI.has(sigla) && c.packQuantity <= 1);
}

export function descriviCollo(c: ConfezioneDaDescrivere): Collo {
  const formato = formatoUnitario(c.unitSize, c.unitOfMeasure);
  const imballo = etichettaImballo(c.packagingType);

  // ── Pezzi non confermati ───────────────────────────────────────────────
  // Dirlo apertamente è meglio di scrivere «1» e lasciar credere che il
  // prezzo sia quello del singolo — è l'errore da ventiquattro volte.
  if (!c.packQuantityConfirmed || contenitoreSenzaConto(c)) {
    return {
      titolo: imballo ? `${maiuscola(imballo)}, pezzi da definire` : 'Pezzi da definire',
      dettaglio: formato,
      pezzi: c.packQuantity,
      daDefinire: true,
      singolo: false,
    };
  }

  // ── Un pezzo solo ──────────────────────────────────────────────────────
  if (c.packQuantity <= 1) {
    const pezzo = nomeDelPezzo(c.packagingType);
    return {
      titolo: pezzo ? `1 ${pezzo}` : 'Confezione singola',
      dettaglio: formato,
      pezzi: 1,
      daDefinire: false,
      singolo: true,
    };
  }

  // ── Più pezzi ──────────────────────────────────────────────────────────
  const contenitore =
    imballo && CONTENITORI.has(c.packagingType!.trim().toUpperCase()) ? imballo : 'confezione';
  return {
    titolo: `${maiuscola(contenitore)} da ${c.packQuantity}`,
    // «l'uno» e non «l'una»: il pezzo non si sa cosa sia, e il maschile è la
    // forma neutra che regge sia con «pezzo» sia con «articolo».
    dettaglio: `${formato} l’uno`,
    pezzi: c.packQuantity,
    daDefinire: false,
    singolo: false,
  };
}

function maiuscola(testo: string): string {
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

/** Su una riga sola: «Collo da 24 · 70 cl l'uno». */
export function colloInLinea(c: ConfezioneDaDescrivere): string {
  const collo = descriviCollo(c);
  return collo.dettaglio ? `${collo.titolo} · ${collo.dettaglio}` : collo.titolo;
}

/**
 * Cosa si sta ordinando, per il documento che va al fornitore.
 *
 * «3 colli da 12 · 36 pezzi in tutto». Il totale dei pezzi c'è **sempre**,
 * anche quando la confezione è singola: è il numero con cui chi prepara il
 * bancale controlla di aver caricato la merce giusta, e un «3» solitario si
 * legge benissimo come tre casse.
 */
export function quantitaOrdinata(c: ConfezioneDaDescrivere, confezioni: number): string {
  const collo = descriviCollo(c);
  const pezzi = collo.pezzi * confezioni;
  if (collo.singolo || collo.daDefinire) {
    return `${confezioni} × ${collo.titolo.toLowerCase().replace(/^1 /, '')}`;
  }
  return `${confezioni} × ${collo.titolo.toLowerCase()} · ${pezzi} pezzi in tutto`;
}
