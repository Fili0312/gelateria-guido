import { z } from 'zod';
import type { BaseUnitValue } from './dto';

/** Finestre esposte dalla scheda prodotto e dall'API. */
export const PRODUCT_STATS_PERIODS = [30, 90, 180, 365] as const;
export type ProductStatsPeriod = (typeof PRODUCT_STATS_PERIODS)[number];

const ROME_DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Chiave del grafico nel giorno/mese commerciale italiano, mai in UTC. */
export function productStatsChartBucketKey(
  instant: Date | string,
  periodDays: ProductStatsPeriod,
): string {
  const parts = Object.fromEntries(
    ROME_DATE_PARTS.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return periodDays === 30 ? day : day.slice(0, 7);
}

export const productStatsPeriodSchema = z.coerce
  .number()
  .int()
  .refine(
    (value): value is ProductStatsPeriod =>
      PRODUCT_STATS_PERIODS.includes(value as ProductStatsPeriod),
    'Il periodo deve essere 30, 90, 180 o 365 giorni.',
  );

export interface ProductPurchasePoint {
  orderId: string;
  orderCode: string | null;
  confirmedAt: string;
  packages: number;
  pieces: number;
  netSpend: string;
  weightedAveragePaid: string;
}

export interface ProductCurrentPrice {
  supplierProductId: string;
  supplierName: string;
  /** Netto della confezione che oggi risulta piu conveniente. */
  pricePerPackage: string;
  packQuantity: number;
  pricePerPiece: string;
  stale: boolean;
  validFrom: string;
}

export interface ProductPriceComparison {
  /**
   * Con confezioni omogenee si confrontano i colli; se nel tempo il formato
   * e cambiato si passa al pezzo, altrimenti la percentuale sarebbe falsa.
   */
  basis: 'PACKAGE' | 'PIECE';
  averagePaid: string;
  currentPrice: string;
  absoluteChange: string;
  percentageChange: string;
}

export interface ProductAnnualSavingsEstimate {
  /** Risparmio potenziale su dodici mesi, non risparmio gia realizzato. */
  amount: string;
  /** Consumo fisico osservato nella finestra scelta. */
  observedQuantity: string;
  /** Lo stesso consumo riportato proporzionalmente a 365 giorni. */
  annualizedQuantity: string;
  baseUnit: BaseUnitValue;
  /** Differenza corrente per pezzo/kg/L fra alternativa e migliore. */
  unitDifference: string;
  bestSupplierName: string;
  alternativeSupplierName: string;
}

export interface ProductPurchaseStats {
  productId: string;
  periodDays: ProductStatsPeriod;
  from: string;
  to: string;
  packages: number;
  pieces: number;
  netSpend: string;
  orderCount: number;
  lastPurchasedAt: string | null;
  /** Media dei giorni trascorsi fra due ordini distinti. */
  averageFrequencyDays: string | null;
  /** Spesa netta / confezioni: non e la media dei prezzi di listino. */
  weightedAveragePaid: string | null;
  weightedAveragePaidPerPiece: string | null;
  currentPrice: ProductCurrentPrice | null;
  comparison: ProductPriceComparison | null;
  estimatedAnnualSavings: ProductAnnualSavingsEstimate | null;
  /** Motivo leggibile quando la proiezione non sarebbe affidabile. */
  estimatedAnnualSavingsReason: string | null;
  purchases: ProductPurchasePoint[];
}
