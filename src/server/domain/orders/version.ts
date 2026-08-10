import { createHash } from 'node:crypto';

export interface PrezzoVistoOrdine {
  lineId: string;
  quantityPacks: number;
  supplierProductId: string;
  supplierId: string;
  productId: string | null;
  nameSnapshot: string;
  supplierNameSnapshot: string;
  supplierCodeSnapshot: string | null;
  packQuantitySnapshot: number;
  packagingTypeSnapshot: string | null;
  unitSizeSnapshot: string;
  uomSnapshot: string;
  currentPriceId: string | null;
  /** Imponibile operativo mostrato e poi fotografato. */
  priceNet: string | null;
  /** Aliquota già risolta con tutta la catena di fallback. */
  vatRate: string | null;
  unitPriceBasisSnapshot: string | null;
}

/**
 * Firma della fotografia prezzi mostrata nel riepilogo.
 *
 * Non basta l'id append-only del prezzo: l'aliquota può arrivare dall'offerta,
 * dal fornitore o dall'organizzazione e quindi cambiare senza creare una
 * nuova riga prezzo. La firma contiene esattamente imponibile e aliquota che
 * verranno fotografati, oltre a quantità, identità e metadati descrittivi.
 * In questo modo anche una modifica all'anagrafica viva fra riepilogo e
 * conferma viene rilevata prima di sostituire lo snapshot visto dall'utente.
 */
export function versionePrezziOrdine(righe: readonly PrezzoVistoOrdine[]): string {
  const canonico = [...righe]
    .sort((a, b) => (a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0))
    .map(
      ({
        lineId,
        quantityPacks,
        supplierProductId,
        supplierId,
        productId,
        nameSnapshot,
        supplierNameSnapshot,
        supplierCodeSnapshot,
        packQuantitySnapshot,
        unitSizeSnapshot,
        uomSnapshot,
        currentPriceId,
        priceNet,
        vatRate,
        unitPriceBasisSnapshot,
      }) => [
        lineId,
        quantityPacks,
        supplierProductId,
        supplierId,
        productId,
        nameSnapshot,
        supplierNameSnapshot,
        supplierCodeSnapshot,
        packQuantitySnapshot,
        unitSizeSnapshot,
        uomSnapshot,
        currentPriceId,
        priceNet,
        vatRate,
        unitPriceBasisSnapshot,
      ],
    );

  return createHash('sha256').update(JSON.stringify(canonico)).digest('hex');
}
