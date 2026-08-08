import { Decimal } from 'decimal.js';
import type { BaseUnit } from '../packaging/units';
import { confrontaOfferte } from './unit-price';

/**
 * Quale prezzo mostrare accanto a un prodotto in catalogo.
 *
 * Sembra una domanda banale — «il più basso» — e non lo è. Un prodotto ha
 * più offerte, e i loro prezzi netti **non sono confrontabili fra loro**: 9
 * euro per 12 bottiglie e 16 euro per 24 non si ordinano guardando 9 e 16.
 * Mostrare il netto più basso spacciandolo per il migliore è precisamente
 * l'errore che questo progetto esiste per non fare.
 *
 * Quindi si sceglie in due modi diversi, e si **dichiara quale dei due** si è
 * usato:
 *
 *  - quando le offerte sono confrontabili (stessa unità base, confezione
 *    dichiarata) si ordina per prezzo unitario, ed è una scelta vera;
 *  - quando non lo sono si mostra comunque un prezzo — un prezzo reale, di un
 *    fornitore preciso, per una confezione precisa — ma `confrontato` è
 *    `false` e l'interfaccia dice che le offerte non si possono mettere in
 *    fila.
 *
 * La seconda non è un ripiego pigro: senza, un prodotto con una sola offerta
 * dalla confezione non dichiarata mostrerebbe «—» pur avendo un prezzo scritto
 * sul listino, e chi guarda penserebbe che il dato manchi.
 */

export interface OffertaPerCatalogo {
  id: string;
  attiva: boolean;
  /** `null` quando l'offerta non ha ancora un prezzo corrente. */
  prezzoNetto: string | null;
  contenutoPerConfezione: string;
  base: BaseUnit;
  /** `false` quando i pezzi per confezione sono un ripiego e non un dato. */
  confezioneCerta: boolean;
}

export interface SceltaDiCatalogo {
  /** L'offerta da mostrare. */
  id: string;
  /** Quante offerte attive hanno un prezzo: il «fra quante» della scelta. */
  conPrezzo: number;
  /** `true` solo se la scelta viene da un confronto di prezzi unitari. */
  confrontato: boolean;
  /**
   * Quanto si risparmia rispetto alla più cara, in percentuale. C'è solo
   * quando il confronto è vero e le offerte sono almeno due.
   */
  risparmioPct: Decimal | null;
}

export function scegliPrezzoDaMostrare(
  offerte: readonly OffertaPerCatalogo[],
): SceltaDiCatalogo | null {
  // Solo le offerte attive: una disattivata resta a storico, ma proporla come
  // prezzo del prodotto significherebbe indicare un fornitore che non lo
  // vende più.
  const conPrezzo = offerte.filter((o) => o.attiva && o.prezzoNetto !== null);
  if (conPrezzo.length === 0) return null;

  const esito = confrontaOfferte(
    conPrezzo.map((o) => ({
      id: o.id,
      prezzoNetto: o.prezzoNetto!,
      contenutoPerConfezione: o.contenutoPerConfezione,
      base: o.base,
      confezioneCerta: o.confezioneCerta,
    })),
  );

  if (esito.migliore) {
    // Il confronto ha escluso qualche offerta (confezione ignota): la scelta
    // resta vera fra quelle rimaste, ma non è «la migliore fra tutte».
    const confrontate = esito.classifica.length;
    const peggiore = esito.classifica.at(-1)!;
    const risparmio =
      confrontate > 1 && peggiore.unitario.gt(0)
        ? peggiore.unitario
            .minus(esito.migliore.unitario)
            .div(peggiore.unitario)
            .mul(100)
            .toDecimalPlaces(1)
        : null;

    return {
      id: esito.migliore.id,
      conPrezzo: conPrezzo.length,
      confrontato: confrontate > 1 && esito.escluse.length === 0,
      risparmioPct: risparmio,
    };
  }

  // Nessun confronto possibile. Si mostra la prima in ordine di fornitore —
  // deterministica, e volutamente **non** «quella col netto più basso»: quel
  // criterio suggerirebbe una convenienza che nessuno ha verificato.
  return {
    id: conPrezzo[0]!.id,
    conPrezzo: conPrezzo.length,
    confrontato: false,
    risparmioPct: null,
  };
}
