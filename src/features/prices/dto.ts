import type { BaseUnitValue, PriceBasisValue } from '@/features/products/dto';
import type { UnitOfMeasureValue } from '@/features/products/schema';

export type PriceSourceValue = 'PRICE_LIST' | 'MANUAL' | 'ORDER';
export type PriceDirectionValue = 'AUMENTO' | 'DIMINUZIONE' | 'INVARIATO';

export interface PriceVariationDTO {
  absolute: string;
  percent: string;
  direction: PriceDirectionValue;
}

export interface PriceWindowVariationDTO {
  days: 30 | 90 | 180;
  fromDate: string;
  toDate: string;
  basePrice: string | null;
  currentPrice: string | null;
  variation: PriceVariationDTO | null;
}

export interface PriceHistoryItem {
  id: string;
  priceListId: string | null;
  priceList: string;
  discounts: number[];
  priceNet: string;
  vatRate: string | null;
  currency: string;
  unitPrice: string;
  unitPriceBasis: PriceBasisValue;
  validFrom: string;
  validTo: string | null;
  source: PriceSourceValue;
  createdAt: string;
  isCurrent: boolean;
  /** Una correzione nello stesso giorno conserva la riga sostituita a audit. */
  annulled: boolean;
  /** Le righe annullate non fanno parte della serie e non hanno variazione. */
  variation: PriceVariationDTO | null;
}

export interface PriceHistoryDTO {
  supplierProductId: string;
  supplierName: string;
  supplierCode: string | null;
  rawName: string;
  productId: string | null;
  productName: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  contentPerPack: string;
  baseUnit: BaseUnitValue;
  /** Aliquota configurata sull'offerta, usata per precompilare il primo prezzo. */
  offerVatRate: string | null;
  currentPriceId: string | null;
  prices: PriceHistoryItem[];
  windowVariations: PriceWindowVariationDTO[];
  /** Valorizzato solo quando `history` riceve esplicitamente una data. */
  queriedAt: string | null;
  priceAt: PriceHistoryItem | null;
}

/** Nome descrittivo usato dalla scheda prodotto, stessa forma del DTO API. */
export type ProductPriceHistoryGroup = PriceHistoryDTO;

export interface SetPriceResult {
  created: boolean;
  history: PriceHistoryDTO;
}

/** Alias mantenuto per il contratto dell'endpoint manuale. */
export type SetManualPriceResult = SetPriceResult;
