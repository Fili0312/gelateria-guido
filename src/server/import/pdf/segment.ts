import type { PaginaParole, Parola } from './bbox';

/**
 * Dalle parole con coordinate alle righe di prodotto.
 *
 * Questo modulo è **puro e senza IA**, ed è una scelta della roadmap: quando
 * un import andrà storto si deve poter dire se ha sbagliato l'estrazione o il
 * modello. Se le due cose stessero insieme non sarebbe possibile.
 *
 * Il ragionamento, nell'ordine in cui gira:
 *
 *  1. le parole si raggruppano in **righe visive** per coordinata verticale;
 *  2. le righe che si ripetono uguali su più pagine sono **intestazioni**;
 *  3. dai bordi sinistri delle righe rimaste si ricavano le **colonne**;
 *  4. ogni riga diventa prodotto, continuazione o sezione;
 *  5. le continuazioni si fondono nel prodotto che le precede.
 *
 * Il passo 5 è il caso che la roadmap chiama il più insidioso, e qui non si
 * risolve indovinando: una riga che non ha nulla nella prima colonna **non
 * può** essere un prodotto nuovo, perché in questi documenti il codice sta
 * sempre a sinistra. È una proprietà della pagina, non un'euristica sul testo.
 */

export type TipoRiga = 'prodotto' | 'sezione' | 'intestazione' | 'ignota';

export interface Cella {
  testo: string;
  x: number;
  xFine: number;
  /** L'indice della colonna riconosciuta, o -1 se la cella non ne ha una. */
  colonna: number;
}

export interface RigaVisiva {
  pagina: number;
  /** Progressivo della riga dentro la pagina, 1-based. */
  numero: number;
  y: number;
  celle: Cella[];
  testo: string;
  /** L'interlinea tipica della pagina: serve a capire se la riga seguente
   *  e' davvero la riga seguente, o se in mezzo c'e' uno stacco. */
  interlinea: number;
}

export interface RigaGrezza {
  pagina: number;
  numero: number;
  tipo: TipoRiga;
  /** Il testo della riga, con le eventuali continuazioni già unite. */
  testo: string;
  celle: Cella[];
  /** Le righe di continuazione assorbite, testuali, per poterle mostrare. */
  continuazioni: string[];
  /** L'ultima sezione incontrata sopra questa riga, se il documento ne ha. */
  sezione: string | null;
  bbox: { x: number; y: number; xFine: number; yFine: number };
}

export interface EsitoSegmentazione {
  righe: RigaGrezza[];
  /** I bordi sinistri delle colonne riconosciute, in punti. */
  colonne: number[];
  /** Le righe scartate perché ripetute su più pagine, con quante volte. */
  intestazioni: { testo: string; pagine: number }[];
  diagnostica: {
    righeVisive: number;
    prodotti: number;
    continuazioniUnite: number;
    sezioni: number;
  };
}

export interface OpzioniSegmentazione {
  /** Quanto possono differire due y perché le parole stiano sulla stessa riga. */
  tolleranzaRiga?: number;
  /** Distanza orizzontale oltre la quale due parole sono celle diverse. */
  distanzaCella?: number;
  /** Quota di pagine su cui una riga deve ripetersi per essere intestazione. */
  quotaIntestazione?: number;
}

const PREDEFINITI = {
  tolleranzaRiga: 2.5,
  distanzaCella: 6,
  quotaIntestazione: 0.6,
} as const;

// ─────────────────────────────────────────────────────────────────────────
//  1. Righe visive
// ─────────────────────────────────────────────────────────────────────────

/**
 * Due numeri adiacenti non stanno mai nella stessa cella.
 *
 * Nei listini Cecconi il prezzo e il primo sconto distano 5,4 punti, cioè
 * **meno** di quanto distino due parole dentro una descrizione (4,8 punti in
 * Barzelli): la sola distanza non li separa, e stringere la soglia
 * spezzerebbe «SAN PELLEGRINO» in due celle. La regola giusta non è
 * geometrica ma di contenuto — in una tabella un numero è sempre un valore a
 * sé — e senza di essa «5,25 10,00» resterebbe una cella sola: il prezzo
 * verrebbe letto sbagliato e lo sconto sparirebbe.
 *
 * `1/1` e `CL.50` non sono numeri per questa regola e restano attaccati a ciò
 * che li precede, che è quello che serve nelle descrizioni.
 */
function dueNumeriAttaccati(cella: string, parola: string): boolean {
  const ultimo = cella.split(/\s+/).at(-1) ?? '';
  return sembraNumero(ultimo) && sembraNumero(parola);
}

/** Raggruppa le parole di una pagina in righe, per coordinata verticale. */
export function righeDiPagina(pagina: PaginaParole, opzioni: OpzioniSegmentazione = {}): RigaVisiva[] {
  const tolleranza = opzioni.tolleranzaRiga ?? PREDEFINITI.tolleranzaRiga;
  const distanza = opzioni.distanzaCella ?? PREDEFINITI.distanzaCella;

  const ordinate = [...pagina.parole].sort((a, b) => a.y - b.y || a.x - b.x);
  const gruppi: Parola[][] = [];

  for (const parola of ordinate) {
    const ultimo = gruppi.at(-1);
    // Si confronta con la prima parola del gruppo e non con l'ultima: su una
    // riga lunga gli scostamenti si sommerebbero, e una riga finirebbe per
    // inglobare quella sotto.
    if (ultimo && Math.abs(parola.y - ultimo[0]!.y) <= tolleranza) {
      ultimo.push(parola);
    } else {
      gruppi.push([parola]);
    }
  }

  const centri = gruppi.map((gruppo) => gruppo[0]!.y);
  const salti = centri.slice(1).map((y, i) => y - centri[i]!).filter((d) => d > 0);
  const ordinati = [...salti].sort((a, b) => a - b);
  const interlinea = ordinati.length ? ordinati[Math.floor(ordinati.length / 2)]! : 12;

  return gruppi.map((gruppo, indice) => {
    const parole = gruppo.sort((a, b) => a.x - b.x);
    const celle: Cella[] = [];

    for (const parola of parole) {
      const corrente = celle.at(-1);
      const vicine = corrente && parola.x - corrente.xFine <= distanza;
      if (corrente && vicine && !dueNumeriAttaccati(corrente.testo, parola.testo)) {
        corrente.testo += ` ${parola.testo}`;
        corrente.xFine = parola.xFine;
      } else {
        celle.push({ testo: parola.testo, x: parola.x, xFine: parola.xFine, colonna: -1 });
      }
    }

    return {
      pagina: pagina.numero,
      numero: indice + 1,
      y: parole[0]!.y,
      celle,
      testo: celle.map((c) => c.testo).join(' '),
      interlinea,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  2. Intestazioni e piè di pagina ripetuti
// ─────────────────────────────────────────────────────────────────────────

function chiave(riga: RigaVisiva): string {
  // Si normalizza via i numeri: «Pag. 1» e «Pag. 2» sono la stessa
  // intestazione, e senza questo non verrebbero mai riconosciute.
  return riga.testo
    .toLowerCase()
    .replace(/\d+([.,]\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quanto possono variare le altezze di una riga ripetuta perche' resti
 *  «nello stesso posto» di pagina in pagina. */
const OSCILLAZIONE_INTESTAZIONE = 12;

/**
 * Le righe che compaiono su quasi tutte le pagine **nello stesso posto** sono
 * cornice, non dati.
 *
 * Due condizioni, e la seconda non è un dettaglio. Si contano le **pagine
 * distinte** e non le occorrenze: una riga ripetuta dieci volte nella stessa
 * pagina è un dato che si ripete, mentre una riga presente una volta per
 * pagina è la cornice. E si pretende che stia **alla stessa altezza**:
 * intestazioni e piè sono ancorati al bordo del foglio, mentre due righe di
 * prodotto che si somigliano — «SCATOLA 1», «SCATOLA 2», che dopo la
 * normalizzazione dei numeri diventano la stessa chiave — capitano a altezze
 * qualsiasi. Senza il vincolo sull'altezza quei prodotti verrebbero scartati
 * come cornice, e sparirebbero dall'import senza che nulla lo segnali.
 */
export function trovaIntestazioni(
  righePerPagina: RigaVisiva[][],
  quota: number = PREDEFINITI.quotaIntestazione,
): Map<string, number> {
  const pagine = righePerPagina.length;
  if (pagine < 2) return new Map();

  const conteggio = new Map<string, { pagine: Set<number>; altezze: number[] }>();
  for (const righe of righePerPagina) {
    for (const riga of righe) {
      const k = chiave(riga);
      if (!k) continue;
      const voce = conteggio.get(k) ?? { pagine: new Set<number>(), altezze: [] };
      voce.pagine.add(riga.pagina);
      voce.altezze.push(riga.y);
      conteggio.set(k, voce);
    }
  }

  const soglia = Math.max(2, Math.ceil(pagine * quota));
  const intestazioni = new Map<string, number>();
  for (const [k, voce] of conteggio) {
    if (voce.pagine.size < soglia) continue;
    const oscillazione = Math.max(...voce.altezze) - Math.min(...voce.altezze);
    if (oscillazione > OSCILLAZIONE_INTESTAZIONE) continue;
    intestazioni.set(k, voce.pagine.size);
  }
  return intestazioni;
}

// ─────────────────────────────────────────────────────────────────────────
//  3. Colonne
// ─────────────────────────────────────────────────────────────────────────

/**
 * I bordi sinistri delle colonne, ricavati da dove le celle cominciano davvero.
 *
 * Non si cerca un numero fisso di colonne né si assume un ordine: si guarda
 * quali ascisse ricorrono. Una colonna esiste se molte righe cominciano una
 * cella allo stesso punto — che è la definizione operativa di colonna in un
 * documento impaginato.
 */
export function trovaColonne(righe: RigaVisiva[], tolleranza = 4): number[] {
  const ascisse: number[] = [];
  for (const riga of righe) for (const cella of riga.celle) ascisse.push(cella.x);
  if (ascisse.length === 0) return [];

  ascisse.sort((a, b) => a - b);
  const gruppi: { centro: number; conteggio: number }[] = [];
  for (const x of ascisse) {
    const ultimo = gruppi.at(-1);
    if (ultimo && x - ultimo.centro <= tolleranza) {
      ultimo.centro = (ultimo.centro * ultimo.conteggio + x) / (ultimo.conteggio + 1);
      ultimo.conteggio += 1;
    } else {
      gruppi.push({ centro: x, conteggio: 1 });
    }
  }

  // Una colonna vera ricorre; un allineamento casuale no. La soglia è
  // relativa al numero di righe, così vale su un listino di 6 pagine come su
  // uno di 60.
  const minimo = Math.max(3, Math.floor(righe.length * 0.05));
  return gruppi
    .filter((g) => g.conteggio >= minimo)
    .map((g) => g.centro)
    .sort((a, b) => a - b);
}

function assegnaColonne(riga: RigaVisiva, colonne: number[], tolleranza = 6): void {
  for (const cella of riga.celle) {
    let migliore = -1;
    let distanza = Infinity;
    for (const [indice, x] of colonne.entries()) {
      const d = Math.abs(cella.x - x);
      if (d < distanza) {
        distanza = d;
        migliore = indice;
      }
    }
    cella.colonna = distanza <= tolleranza ? migliore : -1;
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  4. Classificazione
// ─────────────────────────────────────────────────────────────────────────

/** Un numero come lo scrivono i listini italiani: 1.234,56 oppure 5,25. */
const RE_NUMERO = /^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^-?\d+(?:[.,]\d+)?$/;

export function sembraNumero(testo: string): boolean {
  return RE_NUMERO.test(testo.trim());
}

function celleNumeriche(riga: RigaVisiva): number {
  return riga.celle.filter((c) => sembraNumero(c.testo)).length;
}

/**
 * Una riga è un prodotto se comincia nella colonna più a sinistra e porta
 * almeno due numeri.
 *
 * I due numeri non sono una scelta estetica: ogni riga di listino ha almeno
 * un prezzo e un'altra quantità (quantità, sconto, IVA, netto). Con un numero
 * solo passerebbero le righe di totale e le note; con tre, i listini che non
 * espongono l'IVA perderebbero tutto.
 */
function eProdotto(riga: RigaVisiva, colonnaIniziale: number, tolleranza = 6): boolean {
  const prima = riga.celle[0];
  if (!prima) return false;
  if (Math.abs(prima.x - colonnaIniziale) > tolleranza) return false;
  return celleNumeriche(riga) >= 2;
}

/**
 * Una riga di sezione: comincia a sinistra, non ha numeri, ha poche parole.
 * Nei listini con le categorie in mezzo («AMARI», «BIRRE») è la riga che
 * cambia il reparto delle righe che seguono.
 */
function eSezione(riga: RigaVisiva, colonnaIniziale: number, tolleranza = 6): boolean {
  const prima = riga.celle[0];
  if (!prima) return false;
  if (Math.abs(prima.x - colonnaIniziale) > tolleranza) return false;
  if (celleNumeriche(riga) > 0) return false;
  const parole = riga.testo.trim().split(/\s+/);
  return parole.length >= 1 && parole.length <= 5 && riga.celle.length <= 2;
}

/**
 * Questa riga è la continuazione della descrizione del prodotto sopra?
 *
 * Servono **due** condizioni insieme, e nessuna delle due basta da sola.
 * L'ho imparato dai listini veri:
 *
 *  - **stessa colonna della descrizione.** In Cecconi le righe a capo
 *    («VAP», «EAN: 53827») ricominciano esattamente sotto la descrizione,
 *    mentre il blocco dei totali di fine documento comincia molto più a
 *    destra. Senza questa condizione «Totale ordine: 5.287,11» finirebbe
 *    dentro l'ultimo prodotto del listino.
 *  - **riga immediatamente sotto.** In Cecconi lo stacco fra l'ultimo
 *    prodotto e i totali è di 505 punti contro un'interlinea di 13: enorme.
 *    In Barzelli però è di appena 19 contro 15, cioè 1,25 interlinee — per
 *    questo la sola distanza non basta, e per questo la soglia è 1,8 e non 3.
 *
 * Stessa pagina, sempre: il piè di una pagina non continua l'ultimo prodotto
 * di quella prima.
 */
function eContinuazione(
  riga: RigaVisiva,
  prodotto: RigaGrezza,
  aperti: Map<RigaGrezza, { y: number; colonna: number }>,
  fattoreInterlinea = 1.8,
): boolean {
  if (prodotto.pagina !== riga.pagina) return false;

  const stato = aperti.get(prodotto);
  if (!stato || stato.colonna < 0) return false;

  const prima = riga.celle[0];
  if (!prima || prima.colonna !== stato.colonna) return false;

  return riga.y - stato.y <= riga.interlinea * fattoreInterlinea;
}

// ─────────────────────────────────────────────────────────────────────────
//  Segmentazione completa
// ─────────────────────────────────────────────────────────────────────────

export function segmenta(
  pagine: readonly PaginaParole[],
  opzioni: OpzioniSegmentazione = {},
): EsitoSegmentazione {
  const righePerPagina = pagine.map((pagina) => righeDiPagina(pagina, opzioni));
  const intestazioni = trovaIntestazioni(righePerPagina, opzioni.quotaIntestazione);

  const candidate = righePerPagina.flat().filter((riga) => !intestazioni.has(chiave(riga)));
  const colonne = trovaColonne(candidate);
  const colonnaIniziale = colonne[0] ?? 0;
  for (const riga of candidate) assegnaColonne(riga, colonne);

  const righe: RigaGrezza[] = [];
  /** Per ogni prodotto aperto: dove sta la sua descrizione e a che altezza
   *  è finito, contando anche le continuazioni già assorbite. */
  const colonneAperte = new Map<RigaGrezza, { y: number; colonna: number }>();
  let sezioneCorrente: string | null = null;
  let continuazioniUnite = 0;
  let sezioni = 0;

  for (const riga of candidate) {
    if (eProdotto(riga, colonnaIniziale)) {
      const prodotto: RigaGrezza = {
        pagina: riga.pagina,
        numero: riga.numero,
        tipo: 'prodotto',
        testo: riga.testo,
        celle: riga.celle,
        continuazioni: [],
        sezione: sezioneCorrente,
        bbox: {
          x: riga.celle[0]!.x,
          y: riga.y,
          xFine: riga.celle.at(-1)!.xFine,
          yFine: riga.y,
        },
      };
      righe.push(prodotto);
      // La descrizione è la seconda cella: è lì che una riga a capo deve
      // ricominciare per essere davvero la stessa descrizione.
      colonneAperte.set(prodotto, { y: riga.y, colonna: riga.celle[1]?.colonna ?? -1 });
      continue;
    }

    if (eSezione(riga, colonnaIniziale)) {
      sezioneCorrente = riga.testo.trim();
      sezioni += 1;
      righe.push({
        pagina: riga.pagina,
        numero: riga.numero,
        tipo: 'sezione',
        testo: riga.testo,
        celle: riga.celle,
        continuazioni: [],
        sezione: sezioneCorrente,
        bbox: { x: riga.celle[0]!.x, y: riga.y, xFine: riga.celle.at(-1)!.xFine, yFine: riga.y },
      });
      continue;
    }

    // Né prodotto né sezione: potrebbe essere la continuazione della
    // descrizione del prodotto sopra. Le condizioni sono in `eContinuazione`,
    // e sono strette di proposito: assorbire una riga di troppo non fa
    // fallire niente, allunga solo la descrizione — ed è per questo che è un
    // errore che si scopre tardi, quando il prezzo importato è sbagliato.
    const ultimo = righe.at(-1);
    if (ultimo && ultimo.tipo === 'prodotto' && eContinuazione(riga, ultimo, colonneAperte)) {
      const stato = colonneAperte.get(ultimo)!;
      // Il testo a capo va nella **cella della descrizione**, non in coda
      // alla riga. Attaccarlo in fondo darebbe «... 16,02 22 VAP»: leggibile
      // per un umano, inservibile per chi dovra' ricavarne il formato, che e'
      // proprio dentro quel «VAP» o quel «CL.70».
      const descrizione = ultimo.celle.find((c) => c.colonna === stato.colonna);
      if (descrizione) {
        descrizione.testo += ` ${riga.testo}`;
        descrizione.xFine = Math.max(descrizione.xFine, riga.celle.at(-1)!.xFine);
      }
      ultimo.continuazioni.push(riga.testo);
      ultimo.testo = ultimo.celle.map((c) => c.testo).join(' ');
      colonneAperte.set(ultimo, { y: riga.y, colonna: stato.colonna });
      continuazioniUnite += 1;
      continue;
    }

    righe.push({
      pagina: riga.pagina,
      numero: riga.numero,
      tipo: 'ignota',
      testo: riga.testo,
      celle: riga.celle,
      continuazioni: [],
      sezione: sezioneCorrente,
      bbox: { x: riga.celle[0]!.x, y: riga.y, xFine: riga.celle.at(-1)!.xFine, yFine: riga.y },
    });
  }

  return {
    righe,
    colonne,
    intestazioni: [...intestazioni].map(([testo, pagine_]) => ({ testo, pagine: pagine_ })),
    diagnostica: {
      righeVisive: candidate.length,
      prodotti: righe.filter((r) => r.tipo === 'prodotto').length,
      continuazioniUnite,
      sezioni,
    },
  };
}
