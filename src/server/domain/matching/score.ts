import { Decimal } from 'decimal.js';
import { confrontabili, inUnitaBase, type BaseUnit, type UnitOfMeasure } from '../packaging/units';

/**
 * Quanto due prodotti si somigliano — e se hanno lo stesso formato.
 *
 * Modulo puro: nessun database, nessuna rete. È la parte in cui è più facile
 * sbagliare in modo plausibile, quindi è anche quella con più test.
 *
 * ── La regola che regge tutto ────────────────────────────────────────────
 * **Il testo da solo non basta mai.** «Birra XYZ 33cl» e «Birra XYZ 66cl»
 * hanno somiglianza testuale altissima — differiscono di due caratteri — ma
 * sono due prodotti diversi che non vanno fusi per nessun motivo. Il formato
 * non è un criterio accessorio da sommare al punteggio: è un **cancello**.
 * Formati diversi, nessun abbinamento, qualunque cosa dica il testo.
 */

export interface FormatoConfronto {
  /** Il numero come sta nella descrizione: 33 per «33 cl», 0,33 per «0,33 L». */
  unitSize: Decimal;
  /** L'unità in cui quel numero è scritto. Serve **eccome**: senza, «33 cl»
   *  e «0,33 L» risultano due formati diversi pur essendo lo stesso. */
  unitOfMeasure: UnitOfMeasure;
  baseUnit: BaseUnit;
}

/** Il formato ricondotto all'unità base, che è l'unico modo di confrontarlo. */
function inBase(formato: FormatoConfronto): Decimal {
  return inUnitaBase(formato.unitSize, formato.unitOfMeasure);
}

export interface CompatibilitaFormato {
  compatibile: boolean;
  /** Perché no, quando no: serve a mostrarlo in revisione. */
  motivo: string | null;
}

/** Quanto possono differire due formati e restare lo stesso prodotto. */
export const TOLLERANZA_FORMATO = 0.01;

/**
 * I due formati sono lo stesso formato?
 *
 * Due condizioni, entrambe necessarie: **stessa unità base** — fra chili e
 * litri non si converte, servirebbe una densità che non abbiamo — e
 * **stessa dimensione entro l'1%**. L'uno per cento non è una soglia
 * generosa: serve solo ad assorbire l'arrotondamento di chi scrive `0,33` e
 * chi scrive `0,330`.
 */
export function formatiCompatibili(
  a: FormatoConfronto,
  b: FormatoConfronto,
  tolleranza: number = TOLLERANZA_FORMATO,
): CompatibilitaFormato {
  if (!confrontabili(a.baseUnit, b.baseUnit)) {
    return {
      compatibile: false,
      motivo: `unità diverse: ${a.baseUnit} contro ${b.baseUnit}`,
    };
  }

  const baseA = inBase(a);
  const baseB = inBase(b);
  if (baseA.lte(0) || baseB.lte(0)) {
    return { compatibile: false, motivo: 'formato non noto su almeno uno dei due' };
  }

  const scarto = baseA.minus(baseB).abs().div(Decimal.max(baseA, baseB));
  if (scarto.gt(tolleranza)) {
    return {
      compatibile: false,
      motivo: `formati diversi: ${baseA} contro ${baseB} ${a.baseUnit}`,
    };
  }

  return { compatibile: true, motivo: null };
}

/**
 * Parole che dicono come è confezionato, non che cosa è.
 *
 * Un fornitore scrive «bottiglia», l'altro «confezione», il terzo niente: sono
 * gli stessi tre prodotti. Lasciarle nel confronto fa scendere la
 * sovrapposizione da 1 a 0,67 su descrizioni che parlano della stessa cosa, e
 * quel calo basta a far finire in revisione un abbinamento ovvio.
 *
 * Restano nel nucleo — che serve anche alla ricerca, dove «bottiglia» è utile
 * — e si tolgono solo qui, dove darebbero fastidio.
 */
const PAROLE_DI_CONFEZIONE = new Set([
  'confezione', 'conf', 'bottiglia', 'bottiglie', 'cartone', 'cartoni', 'collo',
  'colli', 'scatola', 'scatole', 'sacchetto', 'sacco', 'secchiello', 'lattina',
  'lattine', 'pezzo', 'pezzi', 'busta', 'buste', 'barattolo', 'vaschetta', 'box',
]);

/**
 * Quante parole hanno in comune, sul totale.
 *
 * Complementa la somiglianza per trigrammi, che guarda i caratteri: «birra
 * moretti» e «birra peroni» condividono molti trigrammi (`bir`, `irr`, `rra`)
 * ma solo una parola su due. Guardare entrambe le cose rende più difficile
 * confondere due prodotti della stessa categoria.
 */
export function sovrapposizioneParole(a: string, b: string): number {
  const utili = (testo: string) =>
    new Set(testo.split(/\s+/).filter((p) => p && !PAROLE_DI_CONFEZIONE.has(p)));
  const paroleA = utili(a);
  const paroleB = utili(b);
  if (paroleA.size === 0 || paroleB.size === 0) return 0;

  let comuni = 0;
  for (const parola of paroleA) if (paroleB.has(parola)) comuni += 1;
  // Jaccard: le parole in comune sul totale delle parole distinte. Dividere
  // per la più corta premierebbe le descrizioni brevi, che sono proprio
  // quelle su cui si sbaglia di più.
  return comuni / (paroleA.size + paroleB.size - comuni);
}

export interface PunteggioAbbinamento {
  /** 0..1. È `0` quando i formati non sono compatibili, senza appello. */
  punteggio: number;
  trigram: number;
  parole: number;
  formato: CompatibilitaFormato;
}

/**
 * Il peso della somiglianza per trigrammi nel punteggio combinato.
 *
 * Vale più della sovrapposizione di parole perché regge meglio le differenze
 * di scrittura fra fornitori — «S.BENED.» contro «SAN BENEDETTO» — che sono
 * la norma nei listini veri.
 */
export const PESO_TRIGRAM = 0.65;

/**
 * Il punteggio combinato.
 *
 * `trigram` arriva da PostgreSQL (`word_similarity`), che è l'unico punto in
 * cui questo modulo dipende da un calcolo fatto altrove — ed è il motivo per
 * cui lo riceve come parametro invece di calcolarlo: così resta puro e
 * verificabile senza database.
 */
export function punteggioAbbinamento(
  trigram: number,
  nucleoA: string,
  nucleoB: string,
  formatoA: FormatoConfronto,
  formatoB: FormatoConfronto,
): PunteggioAbbinamento {
  const formato = formatiCompatibili(formatoA, formatoB);
  const parole = sovrapposizioneParole(nucleoA, nucleoB);
  const combinato = trigram * PESO_TRIGRAM + parole * (1 - PESO_TRIGRAM);

  return {
    // Il formato è un cancello, non un addendo: incompatibile significa zero,
    // e nessun punteggio testuale può riaprirlo.
    punteggio: formato.compatibile ? Number(combinato.toFixed(3)) : 0,
    trigram: Number(trigram.toFixed(3)),
    parole: Number(parole.toFixed(3)),
    formato,
  };
}
