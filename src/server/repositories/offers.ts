import 'server-only';

import type { SupplierOffer } from '@/features/products/dto';

/**
 * La forma con cui un'offerta viene letta e tradotta.
 *
 * Sta in un modulo a parte perché la usano sia il catalogo dei prodotti sia
 * l'elenco dei prodotti fornitore: due repository che leggono la stessa cosa
 * devono leggerla allo stesso modo, altrimenti la scheda prodotto e la coda
 * «da abbinare» finirebbero per mostrare numeri diversi per la stessa riga.
 */

export const OFFER_INCLUDE = {
  select: {
    id: true,
    supplierId: true,
    supplierCode: true,
    rawName: true,
    normalizedName: true,
    description: true,
    brand: true,
    category: true,
    packagingType: true,
    packQuantity: true,
    packQuantityConfirmed: true,
    unitSize: true,
    unitOfMeasure: true,
    contentPerPack: true,
    baseUnit: true,
    vatRate: true,
    gtin: true,
    active: true,
    matchStatus: true,
    productId: true,
    supplier: { select: { id: true, name: true, active: true } },
    currentPrice: {
      select: {
        priceList: true,
        discounts: true,
        priceNet: true,
        unitPrice: true,
        unitPriceBasis: true,
        validFrom: true,
      },
    },
  },
} as const;

interface DecimalLike {
  toString(): string;
}

export interface OfferRecord {
  id: string;
  supplierId: string;
  supplierCode: string | null;
  rawName: string;
  normalizedName: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  packagingType: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
  unitSize: DecimalLike;
  unitOfMeasure: string;
  contentPerPack: DecimalLike;
  baseUnit: string;
  vatRate: DecimalLike | null;
  gtin: string | null;
  active: boolean;
  matchStatus: string;
  productId: string | null;
  supplier: { id: string; name: string; active: boolean };
  currentPrice: {
    priceList: DecimalLike;
    discounts: unknown;
    priceNet: DecimalLike;
    unitPrice: DecimalLike;
    unitPriceBasis: string;
    validFrom: Date;
  } | null;
}

/** Gli sconti sono JSON: si accetta solo una lista di numeri utilizzabili. */
function scontiDaJson(valore: unknown): number[] {
  if (!Array.isArray(valore)) return [];
  return valore
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((v) => Number.isFinite(v) && v > 0);
}

export function mapOffer(record: OfferRecord): SupplierOffer {
  return {
    id: record.id,
    supplierId: record.supplierId,
    supplierName: record.supplier.name,
    supplierActive: record.supplier.active,
    supplierCode: record.supplierCode,
    rawName: record.rawName,
    description: record.description,
    brand: record.brand,
    category: record.category,
    packagingType: record.packagingType,
    packQuantity: record.packQuantity,
    packQuantityConfirmed: record.packQuantityConfirmed,
    unitSize: record.unitSize.toString(),
    unitOfMeasure: record.unitOfMeasure as SupplierOffer['unitOfMeasure'],
    contentPerPack: record.contentPerPack.toString(),
    baseUnit: record.baseUnit as SupplierOffer['baseUnit'],
    vatRate: record.vatRate?.toString() ?? null,
    gtin: record.gtin,
    active: record.active,
    matchStatus: record.matchStatus as SupplierOffer['matchStatus'],
    productId: record.productId,
    price: record.currentPrice
      ? {
          priceList: record.currentPrice.priceList.toString(),
          discounts: scontiDaJson(record.currentPrice.discounts),
          priceNet: record.currentPrice.priceNet.toString(),
          unitPrice: record.currentPrice.unitPrice.toString(),
          unitPriceBasis: record.currentPrice.unitPriceBasis as NonNullable<
            SupplierOffer['price']
          >['unitPriceBasis'],
          validFrom: record.currentPrice.validFrom.toISOString().slice(0, 10),
        }
      : null,
  };
}
