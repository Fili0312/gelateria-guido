import { Decimal } from 'decimal.js';

/**
 * Unità di misura e conversioni.
 *
 * I valori coincidono con gli enum Prisma, ma questo modulo non importa
 * niente da Prisma: è logica pura, deve girare nei test senza database e
 * senza rete.
 */

export type UnitOfMeasure = 'PIECE' | 'MG' | 'G' | 'HG' | 'KG' | 'ML' | 'CL' | 'DL' | 'L';

export type BaseUnit = 'PIECE' | 'KG' | 'L';

export type Dimensione = 'CONTEGGIO' | 'MASSA' | 'VOLUME';

export type PriceBasis = 'PER_PIECE' | 'PER_KG' | 'PER_L';

interface DefinizioneUnita {
  dimensione: Dimensione;
  base: BaseUnit;
  /** Quanto vale una unità di questa misura, espressa nella base. */
  fattore: string;
}

const UNITA: Record<UnitOfMeasure, DefinizioneUnita> = {
  PIECE: { dimensione: 'CONTEGGIO', base: 'PIECE', fattore: '1' },
  MG: { dimensione: 'MASSA', base: 'KG', fattore: '0.000001' },
  G: { dimensione: 'MASSA', base: 'KG', fattore: '0.001' },
  HG: { dimensione: 'MASSA', base: 'KG', fattore: '0.1' },
  KG: { dimensione: 'MASSA', base: 'KG', fattore: '1' },
  ML: { dimensione: 'VOLUME', base: 'L', fattore: '0.001' },
  CL: { dimensione: 'VOLUME', base: 'L', fattore: '0.01' },
  DL: { dimensione: 'VOLUME', base: 'L', fattore: '0.1' },
  L: { dimensione: 'VOLUME', base: 'L', fattore: '1' },
};

/** Come il fornitore può scrivere ciascuna unità. Raccolto dai listini veri. */
const SINONIMI: Record<string, UnitOfMeasure> = {
  // conteggio
  pz: 'PIECE',
  pzi: 'PIECE',
  pezzi: 'PIECE',
  pezzo: 'PIECE',
  pcs: 'PIECE',
  un: 'PIECE',
  unita: 'PIECE',
  cad: 'PIECE',
  nr: 'PIECE',
  n: 'PIECE',
  // massa
  mg: 'MG',
  g: 'G',
  gr: 'G',
  grammi: 'G',
  grammo: 'G',
  hg: 'HG',
  etto: 'HG',
  kg: 'KG',
  kgs: 'KG',
  chilo: 'KG',
  chili: 'KG',
  // volume
  ml: 'ML',
  cc: 'ML',
  cl: 'CL',
  dl: 'DL',
  l: 'L',
  lt: 'L',
  lit: 'L',
  litro: 'L',
  litri: 'L',
};

export function unitaDaSinonimo(testo: string): UnitOfMeasure | null {
  const chiave = testo.toLowerCase().replace(/\./g, '').trim();
  return SINONIMI[chiave] ?? null;
}

/** Tutti i sinonimi riconosciuti, dal più lungo al più corto: serve a
 * costruire espressioni regolari che non spezzino "litri" in "l". */
export function sinonimiOrdinati(): string[] {
  return Object.keys(SINONIMI).sort((a, b) => b.length - a.length);
}

export function dimensioneDi(unita: UnitOfMeasure): Dimensione {
  return UNITA[unita].dimensione;
}

export function baseDi(unita: UnitOfMeasure): BaseUnit {
  return UNITA[unita].base;
}

/** Converte una quantità nella sua unità base. `33 CL` → `0.33 L`. */
export function inUnitaBase(quantita: Decimal.Value, unita: UnitOfMeasure): Decimal {
  return new Decimal(quantita).mul(UNITA[unita].fattore);
}

export function basePerPrezzo(base: BaseUnit): PriceBasis {
  switch (base) {
    case 'KG':
      return 'PER_KG';
    case 'L':
      return 'PER_L';
    case 'PIECE':
      return 'PER_PIECE';
  }
}

/**
 * Due unità sono confrontabili solo se appartengono alla stessa dimensione.
 *
 * Kg e litri non si convertono: servirebbe una densità che non abbiamo, e
 * inventarla produrrebbe un prezzo al chilo plausibile ma falso — l'errore
 * peggiore, perché nessuno lo nota.
 */
export function confrontabili(a: BaseUnit, b: BaseUnit): boolean {
  return a === b;
}

/** Etichetta leggibile, per le schermate. */
export function etichettaUnita(unita: UnitOfMeasure): string {
  const etichette: Record<UnitOfMeasure, string> = {
    PIECE: 'pz',
    MG: 'mg',
    G: 'g',
    HG: 'hg',
    KG: 'kg',
    ML: 'ml',
    CL: 'cl',
    DL: 'dl',
    L: 'L',
  };
  return etichette[unita];
}

export function etichettaBase(base: BaseUnit): string {
  return base === 'PIECE' ? 'pz' : base === 'KG' ? 'kg' : 'L';
}
