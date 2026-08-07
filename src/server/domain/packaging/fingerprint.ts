import { createHash } from 'node:crypto';
import { analizzaDescrizione, type OpzioniAnalisi } from './parse';
import { ordinaParole } from './normalize';
import { inUnitaBase, type UnitOfMeasure } from './units';

/**
 * L'impronta di un prodotto fornitore.
 *
 * Serve come identita' di ripiego quando il fornitore non da' un codice
 * articolo, e come chiave di riconciliazione fra un import e il successivo:
 * stesso nucleo + stesso formato + stessa confezione = stesso prodotto.
 *
 * Costruita sul contenuto in unita' base, non sull'unita' scritta: cosi'
 * "cl.33" e "0,33 L" producono la stessa impronta, che e' esattamente il
 * punto — sono la stessa bottiglia scritta in due modi.
 */

export interface DatiImpronta {
  nucleo: string;
  unitSize: { toString(): string };
  unitOfMeasure: UnitOfMeasure;
  packQuantity: number;
}

function digest(parti: readonly string[]): string {
  return createHash('sha256').update(parti.join('|')).digest('hex').slice(0, 32);
}

/** Impronta a partire da campi gia' estratti. */
export function impronta(dati: DatiImpronta): string {
  const contenuto = inUnitaBase(dati.unitSize.toString(), dati.unitOfMeasure);
  return digest([ordinaParole(dati.nucleo), contenuto.toFixed(6), String(dati.packQuantity)]);
}

/** Impronta a partire dalla descrizione grezza del fornitore. */
export function improntaDaDescrizione(testo: string, opzioni: OpzioniAnalisi = {}): string {
  const { formato, nucleo } = analizzaDescrizione(testo, opzioni);
  return impronta({
    nucleo,
    unitSize: formato.unitSize,
    unitOfMeasure: formato.unitOfMeasure,
    packQuantity: formato.packQuantity,
  });
}
