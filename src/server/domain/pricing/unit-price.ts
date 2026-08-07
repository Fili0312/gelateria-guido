import { Decimal } from 'decimal.js';
import {
  basePerPrezzo,
  confrontabili,
  type BaseUnit,
  type PriceBasis,
} from '../packaging/units.js';

/**
 * Prezzo per unita' base.
 *
 * E' la funzione che rende confrontabili offerte con confezioni diverse:
 * senza, "12 bottiglie a 9 euro" e "24 bottiglie a 16 euro" sembrano il
 * primo piu' conveniente, mentre il secondo lo e' dell'11%.
 */

export const DECIMALI_UNITARIO = 6;

export interface PrezzoUnitario {
  valore: Decimal;
  basis: PriceBasis;
  base: BaseUnit;
}

/**
 * `prezzoNetto / contenutoPerConfezione`.
 *
 * `contenutoPerConfezione` arriva gia' in unita' base dal modulo packaging
 * (`contentPerPack`), quindi qui non si converte nulla: si divide e basta.
 */
export function prezzoPerUnita(
  prezzoNetto: Decimal.Value,
  contenutoPerConfezione: Decimal.Value,
  base: BaseUnit,
): PrezzoUnitario {
  const contenuto = new Decimal(contenutoPerConfezione);
  if (contenuto.lte(0)) {
    throw new Error(
      'Contenuto per confezione non positivo: il prezzo unitario non si puo calcolare. ' +
        'Va segnalato in revisione, non aggirato con un valore di ripiego.',
    );
  }
  return {
    valore: new Decimal(prezzoNetto).div(contenuto).toDecimalPlaces(DECIMALI_UNITARIO),
    basis: basePerPrezzo(base),
    base,
  };
}

/** Prezzo del singolo pezzo, quando la confezione e' nota. */
export function prezzoPerPezzo(prezzoNetto: Decimal.Value, pezziPerConfezione: number): Decimal {
  if (pezziPerConfezione < 1) {
    throw new Error('Pezzi per confezione minore di 1: valore impossibile.');
  }
  return new Decimal(prezzoNetto).div(pezziPerConfezione).toDecimalPlaces(DECIMALI_UNITARIO);
}

export interface OffertaConfrontabile {
  id: string;
  prezzoNetto: Decimal.Value;
  contenutoPerConfezione: Decimal.Value;
  base: BaseUnit;
  /** false quando i pezzi per confezione sono un ripiego e non un dato. */
  confezioneCerta?: boolean;
}

export interface EsitoConfronto {
  /** L'offerta col prezzo per unita' piu' basso. */
  migliore: { id: string; unitario: Decimal } | null;
  /** Ordinate dalla piu' conveniente alla meno. */
  classifica: { id: string; unitario: Decimal }[];
  /** true se tutte le offerte condividono la stessa unita' base. */
  confrontabile: boolean;
  /** Offerte escluse perche' la confezione non e' nota: il loro prezzo per
   * unita' sarebbe calcolato su un numero inventato. */
  escluse: string[];
}

/**
 * Confronta piu' offerte dello stesso prodotto.
 *
 * Due cose che questa funzione si rifiuta di fare, e sono il motivo per cui
 * esiste invece di un `Math.min`:
 *
 *  - confrontare unita' base diverse (kg contro litri): servirebbe una
 *    densita' che non abbiamo, e il risultato sarebbe plausibile ma falso;
 *  - confrontare un'offerta la cui confezione e' ignota: il prezzo al litro
 *    di un collo di cui non si sa quante bottiglie contenga non e' un dato,
 *    e' un'ipotesi.
 *
 * In entrambi i casi si dichiara l'incertezza invece di produrre un numero.
 */
export function confrontaOfferte(offerte: readonly OffertaConfrontabile[]): EsitoConfronto {
  const escluse: string[] = [];
  const valide = offerte.filter((o) => {
    if (o.confezioneCerta === false) {
      escluse.push(o.id);
      return false;
    }
    return true;
  });

  if (valide.length === 0) {
    return { migliore: null, classifica: [], confrontabile: false, escluse };
  }

  const base = valide[0]!.base;
  const confrontabile = valide.every((o) => confrontabili(o.base, base));
  if (!confrontabile) {
    return { migliore: null, classifica: [], confrontabile: false, escluse };
  }

  const classifica = valide
    .map((o) => ({
      id: o.id,
      unitario: prezzoPerUnita(o.prezzoNetto, o.contenutoPerConfezione, o.base).valore,
    }))
    .sort((a, b) => a.unitario.comparedTo(b.unitario));

  return { migliore: classifica[0] ?? null, classifica, confrontabile: true, escluse };
}

/**
 * Quante confezioni del formato B danno la stessa quantita' di N confezioni
 * del formato A.
 *
 * Serve al pulsante "usa fornitore piu' conveniente" (Fase 13): passare da
 * 12 a 24 pezzi non e' un cambio di prezzo, e' un cambio di quantita', e va
 * ricalcolato e dichiarato invece che applicato in silenzio.
 */
export function confezioniEquivalenti(
  confezioniA: number,
  contenutoA: Decimal.Value,
  contenutoB: Decimal.Value,
): { confezioni: number; quantitaEsatta: Decimal; resto: Decimal } {
  const totale = new Decimal(contenutoA).mul(confezioniA);
  const perConfezioneB = new Decimal(contenutoB);
  const esatte = totale.div(perConfezioneB);
  const confezioni = Math.max(1, Math.round(esatte.toNumber()));
  return {
    confezioni,
    quantitaEsatta: esatte,
    resto: perConfezioneB.mul(confezioni).minus(totale),
  };
}
