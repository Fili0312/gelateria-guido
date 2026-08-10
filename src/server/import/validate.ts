import { Decimal } from 'decimal.js';
import { applicaSconti } from '../domain/pricing/discounts';
import { analizzaDescrizione } from '../domain/packaging/parse';
import { baseDi, type UnitOfMeasure } from '../domain/packaging/units';
import { numeroItaliano, type RigaStrutturata } from './profile/mapping';

/**
 * Da riga strutturata a riga importabile, con i suoi difetti dichiarati.
 *
 * È il passo che protegge davvero il catalogo, e **non lo fa un modello**: un
 * prezzo negativo, una confezione a zero o un netto che non torna sono errori
 * di aritmetica e di dominio, e vanno trovati con l'aritmetica e il dominio.
 * Chiedere a un LLM di controllarsi da solo aggiungerebbe un'opinione dove
 * serve un conto.
 *
 * Nessun problema fa sparire la riga: ognuno diventa una **segnalazione**
 * attaccata alla riga, con una gravità. Scartare in silenzio è il modo in cui
 * gli import perdono prodotti senza che nessuno se ne accorga.
 */

export type Gravita = 'errore' | 'avviso';

export interface Segnalazione {
  campo: string;
  gravita: Gravita;
  messaggio: string;
}

export interface RigaValidata {
  codice: string | null;
  descrizione: string | null;
  unitaDiVendita: string | null;
  /** Prezzo di listino, prima degli sconti. */
  prezzoListino: string | null;
  sconti: number[];
  /** Il netto dichiarato dal documento, quando c'è. È quello che si paga. */
  prezzoNettoDichiarato: string | null;
  /** Il netto ricalcolato da listino e sconti. */
  prezzoNettoCalcolato: string | null;
  /** Quello che finirà a database: il dichiarato se c'è, altrimenti il calcolato. */
  prezzoNetto: string | null;
  iva: string | null;
  /** Formato e confezione, ricavati dalla descrizione col modulo della Fase 2. */
  unitSize: string | null;
  unitOfMeasure: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
  contentPerPack: string | null;
  baseUnit: string | null;
  segnalazioni: Segnalazione[];
  /** `true` quando non ci sono errori: solo queste righe sono importabili. */
  importabile: boolean;
}

export interface ContestoValidazione {
  /** La mediana dei prezzi di listino del documento: serve a riconoscere un
   *  valore fuori scala senza dover sapere quanto costa un amaro. */
  medianaListino?: Decimal | null;
  /** Quante volte la mediana un prezzo può valere prima di essere sospetto. */
  fattoreFuoriScala?: number;
  /** Scostamento massimo fra netto dichiarato e calcolato, in euro. */
  tolleranzaNetto?: Decimal.Value;
}

const PREDEFINITI = {
  fattoreFuoriScala: 50,
  tolleranzaNetto: '0.01',
} as const;

/** Codici U.M. che indicano il pezzo singolo: lì la confezione è 1 per davvero. */
const UM_PEZZO = new Set(['bt', 'btg', 'un', 'pz', 'cad', 'nr', 'bot']);

const ALIQUOTE_AMMESSE = new Set([0, 4, 5, 10, 22]);

export function validaRiga(
  riga: RigaStrutturata,
  contesto: ContestoValidazione = {},
): RigaValidata {
  const segnalazioni: Segnalazione[] = [];
  const fattore = contesto.fattoreFuoriScala ?? PREDEFINITI.fattoreFuoriScala;
  const tolleranza = new Decimal(contesto.tolleranzaNetto ?? PREDEFINITI.tolleranzaNetto);

  const aggiungi = (campo: string, gravita: Gravita, messaggio: string) =>
    segnalazioni.push({ campo, gravita, messaggio });

  // ── Descrizione ────────────────────────────────────────────────────────
  const descrizione = riga.descrizione?.trim() || null;
  if (!descrizione) {
    aggiungi('descrizione', 'errore', 'La riga non ha una descrizione.');
  }

  // ── Prezzi ─────────────────────────────────────────────────────────────
  const listino = riga.prezzoListino ? numeroItaliano(riga.prezzoListino) : null;
  const dichiarato = riga.prezzoNetto ? numeroItaliano(riga.prezzoNetto) : null;

  if (riga.prezzoListino && !listino) {
    aggiungi('prezzoListino', 'errore', `«${riga.prezzoListino}» non è un prezzo leggibile.`);
  }
  if (riga.prezzoNetto && !dichiarato) {
    aggiungi('prezzoNetto', 'errore', `«${riga.prezzoNetto}» non è un prezzo leggibile.`);
  }

  const calcolato = listino && listino.gt(0) ? applicaSconti(listino, riga.sconti) : null;

  if (listino && listino.lte(0)) {
    aggiungi('prezzoListino', 'errore', 'Il prezzo di listino deve essere maggiore di zero.');
  }
  if (dichiarato && dichiarato.lt(0)) {
    aggiungi('prezzoNetto', 'errore', 'Il prezzo netto non può essere negativo.');
  }

  const mediana = contesto.medianaListino ?? null;
  if (listino && mediana && mediana.gt(0)) {
    if (listino.gt(mediana.mul(fattore))) {
      // Un prezzo cento volte la mediana del documento è quasi sempre una
      // colonna letta male — tipicamente il totale di riga al posto
      // dell'unitario.
      aggiungi(
        'prezzoListino',
        'avviso',
        `${listino} è molto fuori scala rispetto agli altri prezzi del listino (mediana ${mediana}).`,
      );
    }
  }

  // Il netto dichiarato dal fornitore è quello che si paga, anche quando il
  // conto non torna: è scritto sul documento che diventerà una fattura. Ma la
  // discordanza va detta, non ingoiata.
  if (calcolato && dichiarato) {
    const scarto = calcolato.minus(dichiarato).abs();
    if (scarto.gt(tolleranza)) {
      aggiungi(
        'prezzoNetto',
        'avviso',
        `Il netto dichiarato (${dichiarato}) non coincide con quello calcolato dagli sconti ` +
          `(${calcolato}). Vale il dichiarato: è quello che si paga.`,
      );
    }
  }

  const netto = dichiarato ?? calcolato;
  if (!netto) {
    aggiungi('prezzoNetto', 'errore', 'Non si ricava nessun prezzo da questa riga.');
  }

  // ── IVA ────────────────────────────────────────────────────────────────
  const iva = riga.iva ? numeroItaliano(riga.iva) : null;
  if (iva && !ALIQUOTE_AMMESSE.has(iva.toNumber())) {
    aggiungi('iva', 'avviso', `${iva}% non è un'aliquota IVA italiana.`);
  }

  // ── Formato e confezione, dal modulo del dominio ───────────────────────
  const analisi = descrizione
    ? analizzaDescrizione(descrizione, { unitaDiVendita: riga.unitaDiVendita })
    : null;

  if (analisi) {
    const um = riga.unitaDiVendita?.toLowerCase() ?? '';
    if (!analisi.formato.packQuantityConfirmed && !UM_PEZZO.has(um)) {
      // Non è un errore — si importa lo stesso — ma senza la confezione il
      // prezzo per unità non è un dato, è un'ipotesi. Va detto qui, dove si
      // può ancora correggere a mano.
      aggiungi(
        'packQuantity',
        'avviso',
        'La confezione non è dichiarata: il prezzo per unità non sarà confrontabile finché non la si indica.',
      );
    }
    if (!Number.isInteger(analisi.formato.packQuantity) || analisi.formato.packQuantity < 1) {
      aggiungi(
        'packQuantity',
        'errore',
        'I pezzi per confezione devono essere un intero positivo.',
      );
    }
    if (analisi.formato.contentPerPack.lte(0)) {
      aggiungi('contentPerPack', 'errore', 'Il contenuto della confezione non è positivo.');
    }
  }

  return {
    codice: riga.codice,
    descrizione,
    unitaDiVendita: riga.unitaDiVendita,
    prezzoListino: listino?.toFixed(2) ?? null,
    sconti: riga.sconti,
    prezzoNettoDichiarato: dichiarato?.toFixed(2) ?? null,
    prezzoNettoCalcolato: calcolato?.toFixed(2) ?? null,
    prezzoNetto: netto?.toFixed(2) ?? null,
    iva: iva?.toString() ?? null,
    unitSize: analisi?.formato.unitSize.toString() ?? null,
    unitOfMeasure: analisi?.formato.unitOfMeasure ?? null,
    packQuantity: analisi?.formato.packQuantity ?? 1,
    packQuantityConfirmed: analisi?.formato.packQuantityConfirmed ?? false,
    contentPerPack: analisi?.formato.contentPerPack.toString() ?? null,
    baseUnit: analisi ? baseDi(analisi.formato.unitOfMeasure as UnitOfMeasure) : null,
    segnalazioni,
    importabile: !segnalazioni.some((s) => s.gravita === 'errore'),
  };
}

export interface EsitoValidazione {
  righe: RigaValidata[];
  importabili: number;
  conErrori: number;
  conAvvisi: number;
}

/**
 * Valida tutte le righe insieme.
 *
 * La mediana dei prezzi si calcola **sul documento**, non su una costante:
 * un listino di semilavorati ha prezzi dieci volte quelli di un listino di
 * bibite, e una soglia assoluta segnalerebbe come sospetto tutto l'uno o
 * niente dell'altro.
 */
export function validaTutte(
  righe: readonly RigaStrutturata[],
  contesto: ContestoValidazione = {},
): EsitoValidazione {
  const prezzi = righe
    .map((r) => (r.prezzoListino ? numeroItaliano(r.prezzoListino) : null))
    .filter((n): n is Decimal => n !== null && n.gt(0))
    .sort((a, b) => a.comparedTo(b));
  const medianaListino =
    contesto.medianaListino ?? (prezzi.length > 0 ? prezzi[Math.floor(prezzi.length / 2)]! : null);

  const validate = righe.map((r) => validaRiga(r, { ...contesto, medianaListino }));
  return {
    righe: validate,
    importabili: validate.filter((r) => r.importabile).length,
    conErrori: validate.filter((r) => !r.importabile).length,
    conAvvisi: validate.filter((r) => r.segnalazioni.some((s) => s.gravita === 'avviso')).length,
  };
}
