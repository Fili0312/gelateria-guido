import { Decimal } from 'decimal.js';
import { arrotondaPrezzo } from './discounts';

/**
 * Lo sconto extra concordato col fornitore.
 *
 * È un **premio a posteriori**: non sta sul listino, non si paga meno alla
 * consegna, i soldi tornano indietro dopo. Questa distinzione decide dove il
 * numero entra e dove no, e sbagliarla produce due errori opposti e
 * altrettanto brutti:
 *
 *  - **metterlo nei totali dell'ordine** darebbe un documento che non
 *    corrisponde a quello che il fornitore fatturerà, e la differenza si
 *    scoprirebbe in contabilità;
 *  - **tenerlo fuori dal confronto** farebbe scegliere il fornitore sbagliato
 *    tutte le volte che il più caro a listino è il più economico dopo lo
 *    sconto — cioè esattamente il caso per cui lo sconto è stato concordato.
 *
 * Quindi: l'ordine paga il **netto di listino**, il confronto ragiona sul
 * **netto effettivo**, e l'interfaccia mostra tutti e due dicendo quale è
 * quale.
 *
 * ── «Tutti tranne alcuni» ───────────────────────────────────────────────
 * Lo sconto sta sul fornitore e vale per tutti i suoi articoli. Le eccezioni
 * si segnano sull'offerta: `esclusa` la toglie del tutto, `percentualeSua`
 * gliene dà una diversa. Modellarlo al contrario — lo sconto su ogni riga —
 * avrebbe voluto dire ricopiarlo su trecento offerte e ricopiarlo di nuovo a
 * ogni rinegoziazione.
 */

export interface ScontoExtra {
  /** Percentuale del fornitore. `null` quando non ce n'è uno concordato. */
  percentualeFornitore: Decimal.Value | null;
  /** Questa offerta è fra le eccezioni escluse. */
  esclusa: boolean;
  /** Una percentuale diversa solo per questa offerta. */
  percentualeSua: Decimal.Value | null;
}

/**
 * La percentuale che si applica davvero a un'offerta.
 *
 * L'ordine è: l'esclusione vince su tutto, poi la percentuale della singola
 * offerta, poi quella del fornitore. Una percentuale sull'offerta senza
 * esclusione è una **sostituzione**, non una somma: due sconti che si
 * moltiplicano sono la strada più corta per un numero che nessuno sa
 * rifare a mano.
 */
export function percentualeApplicata(sconto: ScontoExtra): Decimal {
  if (sconto.esclusa) return new Decimal(0);
  if (sconto.percentualeSua !== null) return new Decimal(sconto.percentualeSua);
  if (sconto.percentualeFornitore !== null) return new Decimal(sconto.percentualeFornitore);
  return new Decimal(0);
}

/** Il netto dopo lo sconto extra: quanto costa **davvero** quella confezione. */
export function nettoEffettivo(nettoListino: Decimal.Value, sconto: ScontoExtra): Decimal {
  const pct = percentualeApplicata(sconto);
  if (pct.lte(0)) return new Decimal(nettoListino);
  // Stesso arrotondamento dei netti di listino: due decimali all'even. Il
  // prezzo effettivo va confrontato con prezzi arrotondati alla stessa
  // maniera, o le differenze da un centesimo diventano differenze vere.
  return arrotondaPrezzo(new Decimal(nettoListino).mul(new Decimal(100).minus(pct)).div(100));
}

/** Quanto torna indietro su una confezione. */
export function ritornoPerConfezione(nettoListino: Decimal.Value, sconto: ScontoExtra): Decimal {
  return new Decimal(nettoListino).minus(nettoEffettivo(nettoListino, sconto));
}

export function haScontoExtra(sconto: ScontoExtra): boolean {
  return percentualeApplicata(sconto).gt(0);
}
