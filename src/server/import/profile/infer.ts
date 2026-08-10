import { Decimal } from 'decimal.js';
import {
  applicaProfilo,
  numeroItaliano,
  PROFILO_VUOTO,
  verificaProfilo,
  type EsitoVerifica,
  type ProfiloColonne,
  type RigaCelle,
} from './mapping';

/**
 * Dedurre il profilo di un fornitore **senza chiedere niente a nessuno**.
 *
 * L'idea che rende questa fase molto meno dipendente dall'IA di quanto la
 * roadmap immaginasse: un listino che espone prezzo, sconti e netto contiene
 * già la prova di quali colonne siano quali. Non serve un modello per
 * indovinare che la colonna 4 è il prezzo — basta cercare la combinazione per
 * cui l'aritmetica torna su tutte le righe.
 *
 *   4,61 × (1−0,06) × (1−0,10) = 3,90
 *
 * Su Barzelli e Cecconi funziona, ed è **dimostrato** riga per riga: non è
 * una probabilità, è un conto che quadra 142 e 189 volte.
 *
 * L'IA resta necessaria dove la prova non c'è: un listino che pubblica solo
 * il prezzo finale non permette di distinguere il prezzo dall'IVA guardando
 * i numeri. Lì si chiede, e la risposta si mostra all'operatore.
 */

/** Le aliquote IVA che esistono in Italia. Una colonna che contiene solo
 *  questi valori è l'IVA, non un prezzo. */
const ALIQUOTE_IVA = new Set([0, 4, 5, 10, 22]);

/** I codici U.M. che i listini della gelateria usano davvero. */
const CODICI_UM = new Set([
  'bt',
  'btg',
  'un',
  'pz',
  'cad',
  'nr',
  'bot',
  'co',
  'ct',
  'cf',
  'cart',
  'sc',
  'conf',
  'box',
  'cs',
  'kg',
  'lt',
]);

export interface IndizioColonna {
  colonna: number;
  /** Quante righe hanno un valore in questa colonna. */
  presenze: number;
  /** Quante di quelle sono numeri. */
  numeriche: number;
  /** Quante sono codici U.M. riconosciuti. */
  unitaDiVendita: number;
  /** Quante sono aliquote IVA plausibili. */
  aliquote: number;
  /** Lunghezza media del testo: la descrizione è la colonna lunga. */
  lunghezzaMedia: number;
  /** Il valore mediano, quando la colonna è numerica. */
  mediana: Decimal | null;
}

/** Fotografa ogni colonna: cosa ci si trova dentro, su tutto il campione. */
export function indiziPerColonna(righe: readonly RigaCelle[]): IndizioColonna[] {
  const per = new Map<number, { testi: string[]; numeri: Decimal[] }>();

  for (const riga of righe) {
    for (const c of riga.celle) {
      if (c.colonna < 0) continue;
      const voce = per.get(c.colonna) ?? { testi: [], numeri: [] };
      const testo = c.testo.trim();
      if (testo) {
        voce.testi.push(testo);
        const n = numeroItaliano(testo);
        if (n) voce.numeri.push(n);
      }
      per.set(c.colonna, voce);
    }
  }

  return [...per.entries()]
    .map(([colonna, voce]) => {
      const ordinati = [...voce.numeri].sort((a, b) => a.comparedTo(b));
      return {
        colonna,
        presenze: voce.testi.length,
        numeriche: voce.numeri.length,
        unitaDiVendita: voce.testi.filter((t) => CODICI_UM.has(t.toLowerCase())).length,
        aliquote: voce.numeri.filter((n) => ALIQUOTE_IVA.has(n.toNumber())).length,
        lunghezzaMedia:
          voce.testi.length > 0
            ? voce.testi.reduce((s, t) => s + t.length, 0) / voce.testi.length
            : 0,
        mediana: ordinati.length > 0 ? ordinati[Math.floor(ordinati.length / 2)]! : null,
      };
    })
    .sort((a, b) => a.colonna - b.colonna);
}

export interface EsitoInferenza {
  profilo: ProfiloColonne;
  verifica: EsitoVerifica;
  /**
   * `aritmetica` quando il conto torna e il profilo è dimostrato;
   * `indizi` quando è stato dedotto dalla forma dei dati ma non provato;
   * `nessuna` quando non si è capito niente e serve chiedere.
   */
  fonte: 'aritmetica' | 'indizi' | 'nessuna';
  /** Cosa non si è riusciti a determinare: è ciò che va chiesto all'IA. */
  incerti: string[];
}

/**
 * Le colonne che potrebbero essere un prezzo.
 *
 * Deve contenere numeri quasi ovunque, e non essere l'IVA: una colonna fatta
 * solo di 22 e 10 è l'aliquota, e includerla fra i candidati prezzo
 * moltiplicherebbe le combinazioni da provare senza aggiungere niente.
 */
function candidatiPrezzo(indizi: readonly IndizioColonna[], righe: number): number[] {
  return indizi
    .filter((i) => i.numeriche >= righe * 0.8)
    .filter((i) => i.aliquote < i.numeriche * 0.9)
    .map((i) => i.colonna);
}

/**
 * Le colonne che contengono numeri, comprese quelle che i candidati prezzo
 * escludono.
 *
 * Gli sconti vanno cercati **qui** e non fra i candidati prezzo: una colonna
 * di sconti al 10% e allo 0% è fatta di valori che somigliano ad aliquote IVA,
 * quindi il filtro dei prezzi la scarta — giustamente, perché non è un prezzo.
 * Cercando la cascata solo fra i candidati, gli sconti risultavano sempre
 * vuoti e l'aritmetica non poteva tornare su nessun listino.
 *
 * Si ammettono anche le colonne poco popolate: in Barzelli il secondo sconto
 * c'è su 35 righe di 142, e un'assenza è uno sconto in meno, non un errore.
 */
function colonneNumeriche(indizi: readonly IndizioColonna[]): number[] {
  return indizi
    .filter((i) => i.numeriche > 0 && i.numeriche >= i.presenze * 0.9)
    .map((i) => i.colonna);
}

/**
 * Cerca la combinazione di colonne per cui il conto torna.
 *
 * Lo spazio di ricerca è piccolo di proposito: per ogni coppia
 * (listino, netto) gli sconti sono **le colonne numeriche in mezzo**, perché
 * è così che sono impaginati tutti i listini visti — il prezzo a sinistra,
 * gli sconti in fila, il netto a destra. Provare ogni sottoinsieme di colonne
 * sarebbe esponenziale e non servirebbe: se la disposizione fosse un'altra,
 * l'aritmetica non tornerebbe e si passerebbe a chiedere.
 */
function cercaPerAritmetica(
  righe: readonly RigaCelle[],
  indizi: readonly IndizioColonna[],
): { listino: number; sconti: number[]; netto: number; verifica: EsitoVerifica } | null {
  const candidati = candidatiPrezzo(indizi, righe.length);
  const numeriche = colonneNumeriche(indizi);
  let migliore: {
    listino: number;
    sconti: number[];
    netto: number;
    verifica: EsitoVerifica;
  } | null = null;

  for (const listino of candidati) {
    for (const netto of candidati) {
      if (netto <= listino) continue;
      const sconti = numeriche.filter((c) => c > listino && c < netto);
      const profilo: ProfiloColonne = {
        ...PROFILO_VUOTO,
        prezzoListino: listino,
        sconti,
        prezzoNetto: netto,
      };
      const verifica = verificaProfilo(righe, profilo);
      if (verifica.quota === null) continue;
      if (!migliore || verifica.quota > migliore.verifica.quota!) {
        migliore = { listino, sconti, netto, verifica };
      }
    }
  }

  return migliore;
}

/** Quota di righe che devono tornare perché il profilo si consideri provato. */
export const SOGLIA_ARITMETICA = 0.95;

/**
 * Deduce il profilo dal solo contenuto delle righe.
 *
 * Restituisce anche **cosa non ha capito**: è quello, e solo quello, che
 * andrà chiesto al modello. Chiedere l'intero profilo quando i tre quarti
 * sono dimostrati sarebbe spendere per farsi confermare un conto.
 */
export function deduciProfilo(righe: readonly RigaCelle[]): EsitoInferenza {
  const indizi = indiziPerColonna(righe);
  const incerti: string[] = [];

  // La descrizione è la colonna con il testo più lungo fra quelle non
  // numeriche: in un listino è l'unica che contiene delle frasi.
  const descrittive = indizi
    .filter((i) => i.numeriche < i.presenze * 0.5 && i.lunghezzaMedia >= 6)
    .sort((a, b) => b.lunghezzaMedia - a.lunghezzaMedia);
  const descrizione = descrittive[0]?.colonna ?? null;
  if (descrizione === null) incerti.push('descrizione');

  // Il codice sta nella colonna più a sinistra: è la definizione con cui il
  // segmentatore ha riconosciuto la riga come prodotto.
  const codice = indizi[0]?.colonna ?? null;
  if (codice === null) incerti.push('codice');

  const um = indizi.find((i) => i.unitaDiVendita >= i.presenze * 0.7);
  const iva = indizi
    .filter((i) => i.numeriche >= i.presenze * 0.9 && i.aliquote >= i.numeriche * 0.9)
    .sort((a, b) => b.colonna - a.colonna)[0];

  const aritmetica = cercaPerAritmetica(righe, indizi);
  const provato = aritmetica !== null && (aritmetica.verifica.quota ?? 0) >= SOGLIA_ARITMETICA;

  if (!provato) {
    incerti.push('prezzoListino', 'sconti', 'prezzoNetto');
  }

  // La quantità è la colonna numerica subito a sinistra del prezzo. Nei
  // preventivi vale sempre 1 e **non** è la confezione (decisione D17): si
  // legge per poterla mostrare, non per calcolarci sopra.
  const quantita = provato
    ? (colonneNumeriche(indizi)
        .filter((c) => c < aritmetica.listino && c !== codice)
        .at(-1) ?? null)
    : null;

  const profilo: ProfiloColonne = {
    ...PROFILO_VUOTO,
    codice,
    descrizione,
    quantita,
    unitaDiVendita: um?.colonna ?? null,
    iva: iva?.colonna ?? null,
    ...(provato
      ? {
          prezzoListino: aritmetica.listino,
          sconti: aritmetica.sconti,
          prezzoNetto: aritmetica.netto,
        }
      : {}),
  };

  return {
    profilo,
    verifica: provato ? aritmetica.verifica : verificaProfilo(righe, profilo),
    fonte: provato ? 'aritmetica' : incerti.length < 3 ? 'indizi' : 'nessuna',
    incerti,
  };
}

/** Rilegge il profilo dopo che qualcuno — IA o operatore — l'ha completato. */
export function completaProfilo(
  base: ProfiloColonne,
  aggiunte: Partial<ProfiloColonne>,
): ProfiloColonne {
  return { ...base, ...aggiunte, sconti: aggiunte.sconti ?? base.sconti };
}

/** Il prezzo unitario che ci si aspetta, per capire se un valore è fuori scala. */
export function medianaColonna(righe: readonly RigaCelle[], colonna: number): Decimal | null {
  const profilo: ProfiloColonne = { ...PROFILO_VUOTO, prezzoListino: colonna };
  const numeri = righe
    .map((r) => applicaProfilo(r, profilo).prezzoListino)
    .map((t) => (t ? numeroItaliano(t) : null))
    .filter((n): n is Decimal => n !== null)
    .sort((a, b) => a.comparedTo(b));
  return numeri.length > 0 ? numeri[Math.floor(numeri.length / 2)]! : null;
}
