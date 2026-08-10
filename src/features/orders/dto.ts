import type { BaseUnitValue, PriceBasisValue } from '@/features/products/dto';
import type { UnitOfMeasureValue } from '@/features/products/schema';
import type { ProductCategoryRef } from '@/features/taxonomy/dto';

/**
 * L'offerta da ordinare, dentro un risultato di ricerca.
 *
 * La ricerca trova **prodotti**, ma si ordina da un **fornitore**: ogni
 * risultato porta quindi con sé l'offerta proposta — quella più conveniente,
 * quando un confronto è possibile — e le alternative, perché la scelta resta
 * di chi ordina.
 */
export interface OffertaOrdinabile {
  supplierProductId: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string | null;
  rawName: string;
  priceNet: string;
  /** €/L o €/kg. `null` quando la confezione non è dichiarata. */
  unitPrice: string | null;
  unitPriceBasis: PriceBasisValue | null;
  vatRate: string | null;
  packQuantity: number;
  packagingType: string | null;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  baseUnit: BaseUnitValue;
  /** Sconto extra concordato col fornitore: torna indietro dopo, non ora. */
  scontoExtraPct: string;
  /** Quanto costa davvero dopo lo sconto extra. */
  prezzoEffettivo: string;
  /** È la più conveniente fra quelle confrontate. */
  migliore: boolean;
  /** Il prezzo non si aggiorna da più dei mesi impostati. */
  stale: boolean;
}

export interface RisultatoOrdinabile {
  productId: string;
  name: string;
  brand: string | null;
  category: ProductCategoryRef | null;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  /** Le offerte ordinabili, dalla più conveniente. Vuota = non ordinabile. */
  offerte: OffertaOrdinabile[];
  /**
   * Perché non si può ordinare, quando `offerte` è vuota. Un prodotto senza
   * prezzo corrente non deve sparire dalla ricerca — sparire fa cercare
   * ancora — ma deve dire perché non si può aggiungere.
   */
  nonOrdinabile: string | null;
  /** Confronto possibile fra almeno due offerte. */
  confrontato: boolean;
  /** Quanto si risparmia scegliendo la prima invece dell'ultima. */
  risparmioPerConfezione: string | null;
  /** Quante confezioni di questo prodotto ci sono già nell'ordine. */
  giaNellOrdine: number;
}

export interface RigaOrdine {
  id: string;
  supplierProductId: string;
  productId: string | null;
  supplierId: string;
  supplierName: string;
  supplierCode: string | null;
  name: string;
  packQuantity: number;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  packagingType: string | null;
  /** Netto di **una** confezione, come fotografato quando la riga è nata. */
  priceNet: string;
  vatRate: string | null;
  unitPrice: string | null;
  unitPriceBasis: PriceBasisValue | null;
  quantityPacks: number;
  lineTotalNet: string;
  lineTotalGross: string;
  /** Sconto extra del fornitore su questa riga: `0` quando non ce n'è. */
  scontoExtraPct: string;
  /**
   * Quanto tornerà indietro su questa riga. **Non** è scontato dal totale:
   * il totale dice quanto si paga adesso, questo dice quanto si riavrà.
   */
  ritornoAtteso: string;
  position: number;
  note: string | null;
  /**
   * Cosa diceva il confronto quando la riga è stata aggiunta. Serve a
   * distinguere «ha scelto il più caro» da «era l'unico»: senza, un ordine
   * riletto fra un mese non si sa giustificare.
   */
  migliorAlternativa: {
    supplierProductId: string;
    supplierName: string;
    priceNet: string;
    unitPrice: string | null;
    risparmioPerConfezione: string | null;
  } | null;
  /**
   * L'avviso **calcolato adesso**, non quello fotografato quando la riga è
   * nata: i prezzi cambiano, e un avviso vecchio di un mese consiglierebbe un
   * fornitore che nel frattempo è diventato il più caro.
   *
   * `null` quando non c'è niente da dire — nessuna alternativa, oppure quella
   * scelta è già la più conveniente.
   */
  avviso: AvvisoRiga | null;
  /** L'avviso è stato messo a tacere per questa riga. */
  avvisoIgnorato: boolean;
}

export interface AvvisoRiga {
  risparmioPerConfezione: string;
  risparmioPct: string;
  /** Sul totale della riga, alle quantità già scelte. */
  risparmioTotale: string;
  /** `false` sotto una delle due soglie: si mostra in piccolo, non si grida. */
  meritaAvviso: boolean;
  migliore: {
    supplierProductId: string;
    supplierName: string;
    priceNet: string;
    packQuantity: number;
  };
  /** Cosa cambierebbe passando all'altro: pezzi prima e dopo, spesa, resto. */
  cambio: {
    confezioni: number;
    pezziPrima: number;
    pezziDopo: number;
    esatto: boolean;
    descrizione: string;
    spesaPrima: string;
    spesaDopo: string;
    risparmio: string;
  };
}

export interface OrdineCorrente {
  id: string;
  status: string;
  note: string | null;
  righe: RigaOrdine[];
  totali: {
    righe: number;
    confezioni: number;
    netto: string;
    iva: string;
    lordo: string;
    /** Quanto si risparmierebbe scegliendo ovunque il fornitore migliore. */
    risparmioPotenziale: string;
    /** Su quante righe c'è un avviso oltre soglia. */
    righeConAvviso: number;
    /**
     * Quanto tornerà indietro in tutto per gli sconti extra concordati.
     * Sta accanto al totale, non dentro: il totale è quello che si paga.
     */
    ritornoAtteso: string;
  };
  /** Righe raggruppate per fornitore: è così che l'ordine verrà spedito. */
  perFornitore: {
    supplierId: string;
    supplierName: string;
    righe: number;
    confezioni: number;
    netto: string;
    /** Quanto tornerà indietro da questo fornitore. */
    ritornoAtteso: string;
  }[];
  updatedAt: string;
}

export interface OrderApiErrorBody {
  ok: false;
  error: string;
  fields?: Record<string, string[]>;
}

export interface OrderApiSuccessBody<T> {
  ok: true;
  data: T;
}

export type OrderApiBody<T> = OrderApiSuccessBody<T> | OrderApiErrorBody;
