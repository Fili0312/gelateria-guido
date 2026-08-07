import { Decimal } from 'decimal.js';
import {
  baseDi,
  inUnitaBase,
  sinonimiOrdinati,
  unitaDaSinonimo,
  type BaseUnit,
  type UnitOfMeasure,
} from './units.js';
import { normalizzaTesto } from './normalize.js';

/**
 * Estrazione di formato e confezione dalla descrizione.
 *
 * Nei listini della gelateria il formato sta quasi sempre *dentro* la
 * descrizione, non in una colonna: "XYZ Birra cl.33 conf. 12pz". Questo
 * modulo lo tira fuori, e insieme restituisce la descrizione ripulita dai
 * token di formato — che e' cio' su cui si fa il confronto fra fornitori.
 *
 * Due convenzioni di mestiere che nessuna libreria generica indovina e che
 * qui sono regole esplicite, prese dai listini veri:
 *
 *   1/1 = un litro, 1/2 = mezzo, 1/5 = 20 cl, 1/10 = 10 cl
 *       (vecchia notazione delle bottiglie: la frazione e' di litro)
 *   0.700 = 70 cl, 0.200 = 20 cl
 *       (litri col punto decimale, non millilitri)
 *
 * Regola di lettura delle unita': tutto cio' che e' misurato in PEZZI e'
 * una **confezione**, non un formato. "conf. 12 pz" significa dodici pezzi
 * dentro un collo, non un pezzo da dodici.
 */

export interface Formato {
  /** Quanto contiene il singolo pezzo: 0,33 per una bottiglia da 33 cl. */
  unitSize: Decimal;
  unitOfMeasure: UnitOfMeasure;
  baseUnit: BaseUnit;
  /** Pezzi per confezione. 1 quando si compra il pezzo singolo. */
  packQuantity: number;
  /**
   * `false` quando il numero e' un ripiego e non un dato: il fornitore
   * vende a collo ma non ha scritto quanti pezzi contiene. Senza questa
   * distinzione il prezzo al litro verrebbe calcolato su un numero
   * inventato, e sembrerebbe un dato come tutti gli altri.
   */
  packQuantityConfirmed: boolean;
  /** unitSize convertito in unita' base, moltiplicato per i pezzi. */
  contentPerPack: Decimal;
  /** I frammenti riconosciuti, per poterli mostrare in revisione. */
  riconosciuti: string[];
}

export interface OpzioniAnalisi {
  /**
   * Il codice U.M. della colonna del fornitore: BT, UN, PZ, CAD (pezzo
   * singolo) oppure CO, CT, CF, SC (collo). Non dice quanti pezzi ci sono,
   * ma dice se la domanda ha senso — ed e' cio' che distingue un "1"
   * affidabile da un "1" messo per non lasciare il campo vuoto.
   */
  unitaDiVendita?: string | null;
}

/** Codici U.M. che indicano il pezzo singolo. */
const UM_PEZZO_SINGOLO = new Set(['bt', 'btg', 'un', 'pz', 'cad', 'nr', 'bot']);
/** Codici U.M. che indicano un collo di piu' pezzi. */
const UM_COLLO = new Set(['co', 'ct', 'cf', 'cart', 'sc', 'conf', 'box', 'cs']);

interface Riscontro {
  inizio: number;
  fine: number;
  testo: string;
  unitSize?: Decimal;
  uom?: UnitOfMeasure;
  pack?: number;
}

function numero(grezzo: string): Decimal {
  return new Decimal(grezzo.replace(',', '.'));
}

/** Alternativa regex con tutti i sinonimi di unita', dal piu' lungo. */
const UNITA_ALT = sinonimiOrdinati()
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

/** Come sopra, ma senza i sinonimi di una lettera sola: servono dove il
 * rischio di falsi positivi e' alto (una "n" o una "l" isolate compaiono
 * ovunque in un nome di prodotto). */
const UNITA_ALT_SICURE = sinonimiOrdinati()
  .filter((s) => s.length > 1)
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const NUM = String.raw`\d+(?:[.,]\d+)?`;

/**
 * Le regole, in ordine di specificita'. La prima che copre un pezzo di
 * testo se lo prende: le successive lo saltano. E' cio' che impedisce a
 * "CL.33X24" di essere letto come "33 cl" piu' un "24" orfano.
 */
const REGOLE: { nome: string; re: RegExp; leggi: (m: RegExpExecArray) => Partial<Riscontro> }[] = [
  {
    // Ctx48, CT x 100, conf.x6 — cartone con il moltiplicatore attaccato.
    nome: 'cartone-per',
    re: new RegExp(String.raw`\b(?:ct|cart|conf|cf|co)\.?\s*[x×]\s*(\d{1,4})\b`, 'gi'),
    leggi: (m) => ({ pack: Number(m[1]) }),
  },
  {
    // 12x33cl, 4 x 2,5 kg, 12 x 500ml — moltiplicatore prima del formato.
    nome: 'per-formato',
    re: new RegExp(String.raw`\b(\d{1,4})\s*[x×]\s*(${NUM})\s*(${UNITA_ALT_SICURE})\b`, 'gi'),
    leggi: (m) => ({
      pack: Number(m[1]),
      unitSize: numero(m[2]!),
      uom: unitaDaSinonimo(m[3]!) ?? undefined,
    }),
  },
  {
    // CL.33X24, cl 33 x 24 — unita' prefissa, poi il moltiplicatore.
    nome: 'unita-numero-per',
    re: new RegExp(String.raw`\b(${UNITA_ALT})\.?\s*(${NUM})\s*[x×]\s*(\d{1,4})\b`, 'gi'),
    leggi: (m) => ({
      unitSize: numero(m[2]!),
      uom: unitaDaSinonimo(m[1]!) ?? undefined,
      pack: Number(m[3]!),
    }),
  },
  {
    // 33cl x12, 200 ml x 24 — formato, poi il moltiplicatore.
    nome: 'formato-per',
    re: new RegExp(String.raw`\b(${NUM})\s*(${UNITA_ALT_SICURE})\s*[x×]\s*(\d{1,4})\b`, 'gi'),
    leggi: (m) => ({
      unitSize: numero(m[1]!),
      uom: unitaDaSinonimo(m[2]!) ?? undefined,
      pack: Number(m[3]!),
    }),
  },
  {
    // 1/1, 1/2, 1/5, 1/10 — frazioni di litro. Il numeratore dev'essere 1,
    // altrimenti si mangerebbe le date (28/02) e i gradi (2/3).
    // Il lookbehind ammette una lettera prima: "VARNELLI1/1" esiste davvero.
    nome: 'frazione-di-litro',
    re: /(?<![\d/])1\s*\/\s*(1|2|3|4|5|6|8|10|12|20)(?![\d/])/g,
    leggi: (m) => ({ unitSize: new Decimal(1).div(Number(m[1])), uom: 'L' as UnitOfMeasure }),
  },
  {
    // CL.70, LT.1, LT.1.5, gr.80, n.120, KG 5 — unita' prima del numero.
    nome: 'unita-numero',
    re: new RegExp(String.raw`\b(${UNITA_ALT})\.?\s*(${NUM})\b`, 'gi'),
    leggi: (m) => ({ unitSize: numero(m[2]!), uom: unitaDaSinonimo(m[1]!) ?? undefined }),
  },
  {
    // 470gr, 500 ml, 5 kg, 0,33 L, 5.0 CL — numero prima dell'unita'.
    nome: 'numero-unita',
    re: new RegExp(String.raw`\b(${NUM})\s*(${UNITA_ALT})\b`, 'gi'),
    leggi: (m) => ({ unitSize: numero(m[1]!), uom: unitaDaSinonimo(m[2]!) ?? undefined }),
  },
  {
    // 0.700, 0.200, 1.500 — litri col punto decimale, senza unita' scritta.
    // Vincolato: parte intera 0-4 e almeno due decimali, altrimenti si
    // mangerebbe i prezzi, i gradi alcolici e le annate dei vini.
    nome: 'litri-decimali',
    re: /(?<![\d.,])([0-4][.,]\d{2,3})(?![\d.,])/g,
    leggi: (m) => ({ unitSize: numero(m[1]!), uom: 'L' as UnitOfMeasure }),
  },
  {
    // conf. 12 pz, conf. da 50, scatola 120 pz, box 200 pezzi
    nome: 'confezione-da',
    re: new RegExp(
      String.raw`\b(?:conf|cf|cart|ct|scatola|scat|box|collo|co|sacco|secchiello)\.?\s*(?:da\s*)?(\d{1,4})\b`,
      'gi',
    ),
    leggi: (m) => ({ pack: Number(m[1]) }),
  },
  {
    // 24 bottiglie, 12 pezzi, 1000 pz, 120 pz
    nome: 'numero-pezzi',
    re: /\b(\d{1,4})\s*(?:pz|pzi|pezzi|pcs|bottiglie|lattine|buste|barattoli)\b/gi,
    leggi: (m) => ({ pack: Number(m[1]) }),
  },
  {
    // 3x24 nudo, senza unita': "ESTATHE BICCH. LIMONE 3x24" sono ventiquattro
    // confezioni da tre bicchieri, cioe' 72 pezzi a collo. Si moltiplica.
    // Solo interi: "CM.14,5X7MM" e' una misura, non una confezione, e il
    // decimale e' proprio cio' che la distingue.
    nome: 'per-nudo',
    re: /(?<![\d.,\p{L}])(\d{1,3})\s*[x×]\s*(\d{1,3})(?![\d.,])/giu,
    leggi: (m) => ({ pack: Number(m[1]) * Number(m[2]) }),
  },
  {
    // "LITRO" scritto per esteso e da solo, senza numero: nei listini vale
    // una bottiglia da un litro ("SAN BENEDETTO LITRO GAS PETX12").
    nome: 'litro-parola',
    re: /(?<![\d,.])\b(litro|litri)\b(?![\s.,]*\d)/gi,
    leggi: () => ({ unitSize: new Decimal(1), uom: 'L' as UnitOfMeasure }),
  },
  {
    // x12 orfano: il formato e' gia' stato consumato da una regola
    // precedente ("CL.33 X24"), oppure il moltiplicatore e' incollato a una
    // parola ("PETX12", "ELITEX6"). Tetto a 999 perche' una x attaccata a
    // un nome non puo' ragionevolmente indicare mille pezzi — li' sarebbe
    // piu' probabile un pezzo di codice articolo.
    nome: 'per-orfano',
    re: /(?<!\d)[x×]\s*(\d{1,3})\b/gi,
    leggi: (m) => ({ pack: Number(m[1]) }),
  },
];

/** Un formato plausibile: nessuna bottiglia da 500 litri, nessun sacco da 0 kg. */
function plausibile(unitSize: Decimal, uom: UnitOfMeasure): boolean {
  if (unitSize.lte(0)) return false;
  const inBase = inUnitaBase(unitSize, uom);
  if (baseDi(uom) === 'PIECE') return unitSize.lte(10_000);
  // 50 kg / 50 L e' gia' generoso per una gelateria; sopra e' un errore.
  return inBase.lte(50);
}

interface Analisi {
  formato: Formato;
  riscontri: Riscontro[];
}

function analizza(testo: string, opzioni: OpzioniAnalisi = {}): Analisi {
  const consumato = new Array<boolean>(testo.length).fill(false);
  const riscontri: Riscontro[] = [];

  for (const regola of REGOLE) {
    regola.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regola.re.exec(testo)) !== null) {
      const inizio = m.index;
      const fine = m.index + m[0].length;
      // Se una regola piu' specifica ha gia' preso questo pezzo, si salta.
      let sovrapposto = false;
      for (let i = inizio; i < fine; i++) {
        if (consumato[i]) {
          sovrapposto = true;
          break;
        }
      }
      if (sovrapposto) continue;

      const letto = regola.leggi(m);
      if (letto.unitSize && letto.uom && !plausibile(letto.unitSize, letto.uom)) continue;
      if (letto.pack !== undefined && (letto.pack < 1 || letto.pack > 10_000)) continue;
      if (!letto.unitSize && letto.pack === undefined) continue;

      for (let i = inizio; i < fine; i++) consumato[i] = true;
      riscontri.push({ inizio, fine, testo: m[0], ...letto });
    }
  }

  riscontri.sort((a, b) => a.inizio - b.inizio);

  // Il formato e' il primo riscontro che porta un'unita' NON di conteggio:
  // i pezzi descrivono la confezione, non il contenuto.
  const conFormato = riscontri.find((r) => r.uom && baseDi(r.uom) !== 'PIECE');
  // I pezzi trovati come "unita' di misura" sono in realta' confezioni.
  const comePezzi = riscontri.find((r) => r.uom && baseDi(r.uom) === 'PIECE');
  const conPack = riscontri.find((r) => r.pack !== undefined);

  const unitSize = conFormato?.unitSize ?? new Decimal(1);
  const unitOfMeasure: UnitOfMeasure = conFormato?.uom ?? 'PIECE';

  let packQuantity = 1;
  let packQuantityConfirmed = false;

  if (conPack?.pack !== undefined) {
    packQuantity = conPack.pack;
    packQuantityConfirmed = true;
  } else if (comePezzi?.unitSize) {
    packQuantity = comePezzi.unitSize.toNumber();
    packQuantityConfirmed = true;
  } else {
    // Nessun numero di pezzi scritto: decide il codice U.M. del fornitore.
    const um = (opzioni.unitaDiVendita ?? '').toLowerCase().replace(/\./g, '').trim();
    if (UM_PEZZO_SINGOLO.has(um)) {
      packQuantityConfirmed = true; // si compra a pezzo: 1 e' un dato, non un ripiego
    } else if (UM_COLLO.has(um)) {
      packQuantityConfirmed = false; // si compra a collo ma non sappiamo di quanti
    } else {
      packQuantityConfirmed = conFormato !== undefined && comePezzi === undefined;
    }
  }

  const contentPerPack = inUnitaBase(unitSize, unitOfMeasure).mul(packQuantity);

  return {
    formato: {
      unitSize,
      unitOfMeasure,
      baseUnit: baseDi(unitOfMeasure),
      packQuantity,
      packQuantityConfirmed,
      contentPerPack,
      riconosciuti: riscontri.map((r) => r.testo.trim()),
    },
    riscontri,
  };
}

/** Estrae formato e confezione da una descrizione. */
export function analizzaFormato(testo: string, opzioni: OpzioniAnalisi = {}): Formato {
  return analizza(testo, opzioni).formato;
}

/**
 * La descrizione senza i token di formato, normalizzata.
 *
 * E' il testo su cui si confrontano prodotti di fornitori diversi: "Birra
 * XYZ 33cl x12" e "XYZ Birra cl.33 conf. 12pz" hanno formati identici e
 * nuclei identici, quindi si riconoscono.
 */
export function nucleoDescrizione(testo: string, opzioni: OpzioniAnalisi = {}): string {
  const { riscontri } = analizza(testo, opzioni);
  let residuo = '';
  let cursore = 0;
  for (const r of riscontri) {
    residuo += testo.slice(cursore, r.inizio) + ' ';
    cursore = r.fine;
  }
  residuo += testo.slice(cursore);
  return normalizzaTesto(residuo);
}

/** Formato e nucleo in un colpo solo: e' quasi sempre cosi' che servono. */
export function analizzaDescrizione(
  testo: string,
  opzioni: OpzioniAnalisi = {},
): { formato: Formato; nucleo: string } {
  const { formato, riscontri } = analizza(testo, opzioni);
  let residuo = '';
  let cursore = 0;
  for (const r of riscontri) {
    residuo += testo.slice(cursore, r.inizio) + ' ';
    cursore = r.fine;
  }
  residuo += testo.slice(cursore);
  return { formato, nucleo: normalizzaTesto(residuo) };
}
