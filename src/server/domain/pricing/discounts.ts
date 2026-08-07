import { Decimal } from 'decimal.js';

/**
 * Sconti a cascata.
 *
 * Entrambi i fornitori della gelateria applicano piu' sconti percentuali
 * **in sequenza**, non uno solo: Barzelli ha due colonne (SC.1%, SC.2%),
 * Cecconi cinque. 4,61 con 6% e 10% non fa 4,61 meno il 16%, fa
 * 4,61 x 0,94 x 0,90.
 *
 * ARROTONDAMENTO. I listini arrotondano il netto a due decimali **all'even**
 * (arrotondamento bancario), non per eccesso. Verificato su otto righe reali:
 * half-even le indovina tutte, half-up sbaglia i due pareggi
 * (5,25 -10% = 4,725 -> 4,72 e 21,45 -10% = 19,305 -> 19,30).
 * Sono due pareggi su otto casi: pochi per chiamarla una certezza, abbastanza
 * per non scegliere l'altro. Per questo `MODO_ARROTONDAMENTO` e' una costante
 * con un nome, e non una cifra sparsa nel codice.
 */

export const MODO_ARROTONDAMENTO = Decimal.ROUND_HALF_EVEN;
export const DECIMALI_PREZZO = 2;

/** Arrotonda un importo come fa il listino del fornitore. */
export function arrotondaPrezzo(valore: Decimal.Value): Decimal {
  return new Decimal(valore).toDecimalPlaces(DECIMALI_PREZZO, MODO_ARROTONDAMENTO);
}

/**
 * Applica in sequenza gli sconti percentuali e arrotonda una volta sola,
 * alla fine.
 *
 * Arrotondare a ogni passaggio darebbe risultati diversi su alcune righe;
 * sui dati veri le due strade coincidono, quindi si sceglie quella
 * matematicamente pulita.
 */
export function applicaSconti(prezzoListino: Decimal.Value, sconti: readonly number[]): Decimal {
  let valore = new Decimal(prezzoListino);
  for (const sconto of sconti) {
    if (!Number.isFinite(sconto) || sconto === 0) continue;
    valore = valore.mul(new Decimal(100).minus(sconto).div(100));
  }
  return arrotondaPrezzo(valore);
}

/**
 * Lo sconto unico equivalente alla cascata, in percentuale.
 * 6% + 10% non fanno 16% ma 15,4%: serve a mostrarlo in chiaro.
 */
export function scontoEquivalente(sconti: readonly number[]): Decimal {
  let residuo = new Decimal(1);
  for (const sconto of sconti) {
    if (!Number.isFinite(sconto) || sconto === 0) continue;
    residuo = residuo.mul(new Decimal(100).minus(sconto).div(100));
  }
  return new Decimal(1).minus(residuo).mul(100).toDecimalPlaces(4, MODO_ARROTONDAMENTO);
}

export interface EsitoVerifica {
  coerente: boolean;
  calcolato: Decimal;
  dichiarato: Decimal;
  /** Differenza fra quello che dice il listino e quello che torna dai conti. */
  scarto: Decimal;
}

/**
 * Confronta il netto stampato sul listino con quello che risulta dai conti.
 *
 * Il prezzo che si salva a database e' **quello stampato**: e' il numero che
 * finira' in fattura, e ricalcolarlo introdurrebbe solo occasioni di
 * discostarsene. Il calcolo serve come controllo: se i due non coincidono,
 * quasi sempre significa che gli sconti sono stati letti male dal PDF — ed e'
 * meglio scoprirlo in revisione che sei mesi dopo, guardando uno storico che
 * non torna.
 *
 * La tolleranza di un centesimo assorbe le differenze di arrotondamento dei
 * gestionali dei fornitori, senza lasciar passare uno sconto sbagliato.
 */
export function verificaNetto(
  prezzoListino: Decimal.Value,
  sconti: readonly number[],
  nettoDichiarato: Decimal.Value,
  tolleranza: Decimal.Value = '0.01',
): EsitoVerifica {
  const calcolato = applicaSconti(prezzoListino, sconti);
  const dichiarato = new Decimal(nettoDichiarato);
  const scarto = dichiarato.minus(calcolato);
  return {
    coerente: scarto.abs().lte(tolleranza),
    calcolato,
    dichiarato,
    scarto,
  };
}

/** Normalizza la lista di sconti letta dal PDF: via i vuoti e gli zeri. */
export function scontiPuliti(grezzi: readonly unknown[]): number[] {
  return grezzi
    .map((s) => (typeof s === 'number' ? s : Number(String(s ?? '').replace(',', '.'))))
    .filter((s) => Number.isFinite(s) && s > 0 && s < 100);
}
