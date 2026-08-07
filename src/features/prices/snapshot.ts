import { Decimal } from 'decimal.js';

export interface CommercialPriceSnapshot {
  priceList: string;
  discounts: readonly number[];
  priceNet: string;
  vatRate: string | null;
  currency: string;
  unitPrice: string;
  unitPriceBasis: string;
}

function sameDecimal(left: string, right: string): boolean {
  return new Decimal(left).eq(right);
}

/**
 * L'idempotenza considera l'intera fotografia commerciale, non solo il
 * netto: cambiare IVA o sequenza degli sconti e una correzione tracciabile
 * anche quando, per arrotondamento, il totale coincide.
 */
export function sameCommercialPrice(
  left: CommercialPriceSnapshot,
  right: CommercialPriceSnapshot,
): boolean {
  return (
    sameDecimal(left.priceList, right.priceList) &&
    left.discounts.length === right.discounts.length &&
    left.discounts.every((discount, index) => discount === right.discounts[index]) &&
    sameDecimal(left.priceNet, right.priceNet) &&
    (left.vatRate === null
      ? right.vatRate === null
      : right.vatRate !== null && sameDecimal(left.vatRate, right.vatRate)) &&
    left.currency === right.currency &&
    sameDecimal(left.unitPrice, right.unitPrice) &&
    left.unitPriceBasis === right.unitPriceBasis
  );
}
