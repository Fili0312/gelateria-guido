import type { BaseUnitValue, PriceBasisValue } from '@/features/products/dto';
import type { UnitOfMeasureValue } from '@/features/products/schema';
import type { ProductCategoryRef } from '@/features/taxonomy/dto';

/** Lo stato del confronto, come lo decide il dominio. */
export type ComparisonState =
  | 'CONFRONTATO'
  | 'OFFERTA_UNICA'
  | 'NON_CONFRONTABILE'
  | 'SENZA_PREZZO';

export interface ComparedOffer {
  supplierProductId: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string | null;
  priceNet: string;
  unitPrice: string;
  unitPriceBasis: PriceBasisValue;
  packQuantity: number;
  packagingType: string | null;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  contentPerPack: string;
  baseUnit: BaseUnitValue;
  /** Il prezzo non si aggiorna da più dei mesi impostati. */
  stale: boolean;
  validFrom: string;
}

export interface ExcludedOffer {
  supplierProductId: string;
  supplierName: string;
  /** Perché non partecipa: si mostra così com'è. */
  reason: string;
}

export interface ComparisonRow {
  productId: string;
  productName: string;
  brand: string | null;
  category: ProductCategoryRef | null;
  unitSize: string;
  unitOfMeasure: UnitOfMeasureValue;
  state: ComparisonState;
  /** Perché non c'è confronto, quando non c'è. */
  reason: string | null;
  best: ComparedOffer | null;
  /** La più cara fra le confrontabili: è ciò che rende reale il risparmio. */
  worst: ComparedOffer | null;
  offersCompared: number;
  /**
   * Gli id delle offerte confrontate, dalla più conveniente alla meno.
   * Serve alla scheda prodotto per elencarle nell'ordine deciso dal dominio
   * invece di riordinarle per conto suo.
   */
  rankedOfferIds: string[];
  excluded: ExcludedOffer[];
  /** Differenza di prezzo per unità base. */
  unitDifference: string | null;
  /** Euro risparmiati su **una confezione della migliore**. */
  savingPerPack: string | null;
  savingPct: string | null;
  /** Supera entrambe le soglie impostate. */
  worthAlert: boolean;
  anyStale: boolean;
}

export interface ComparisonTotals {
  products: number;
  compared: number;
  singleOffer: number;
  notComparable: number;
  withoutPrice: number;
  worthAlert: number;
  /** Somma dei risparmi per confezione: un ordine intero, una confezione per prodotto. */
  savingPerPack: string;
  stale: number;
}

export interface ComparisonReport {
  /** Solo i confronti veri, ordinati per impatto. */
  comparisons: ComparisonRow[];
  /**
   * Tutto il resto, **tenuto separato**: fondere «non confrontabile» con
   * «confrontato e pari» produrrebbe un elenco in cui non si distingue una
   * scelta fatta da una scelta impossibile.
   */
  withoutComparison: ComparisonRow[];
  totals: ComparisonTotals;
  thresholds: { percentage: number; euro: number; staleMonths: number };
}

export type ComparisonSort = 'saving-desc' | 'saving-pct-desc' | 'name-asc';
