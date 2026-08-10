import { Decimal } from 'decimal.js';
import type {
  ProductAnnualSavingsEstimate,
  ProductCurrentPrice,
  ProductPriceComparison,
  ProductPurchasePoint,
  ProductPurchaseStats,
  ProductStatsPeriod,
} from '@/features/products/stats';
import {
  baseDi,
  inUnitaBase,
  type BaseUnit,
  type UnitOfMeasure,
} from '@/server/domain/packaging/units';

const DAY_MS = 86_400_000;
const STATI_ACQUISTO = new Set(['CONFIRMED', 'SENT', 'RECEIVED']);

export interface ProductPurchaseSnapshot {
  orderId: string;
  orderCode: string | null;
  orderStatus: string;
  confirmedAt: Date;
  quantityPacks: number;
  packQuantitySnapshot: number;
  unitSizeSnapshot: string;
  uomSnapshot: UnitOfMeasure;
  unitPriceNetSnapshot: string;
  lineTotalNet: string;
}

export interface CurrentProductPriceInput {
  supplierProductId: string;
  supplierName: string;
  pricePerPackage: string;
  packQuantity: number;
  stale: boolean;
  validFrom: Date;
  /** Presenti soltanto quando esiste un confronto corrente vero. */
  unitDifference?: string | null;
  baseUnit?: BaseUnit | null;
  alternativeSupplierName?: string | null;
}

/** Input minimo riusabile anche dalle aggregazioni della dashboard. */
export interface ConsumptionSnapshot {
  quantityPacks: number;
  packQuantitySnapshot: number;
  unitSizeSnapshot: string;
  uomSnapshot: UnitOfMeasure;
}

export type AnnualSavingsCalculation =
  | {
      ok: true;
      observedQuantity: string;
      annualizedQuantity: string;
      amount: string;
      baseUnit: BaseUnit;
      unitDifference: string;
    }
  | {
      ok: false;
      reason: 'NO_CONSUMPTION' | 'INCOMPATIBLE_UNIT' | 'INVALID_QUANTITY';
    };

/**
 * Annualizza il consumo fisico osservato e applica una differenza corrente
 * per unità base. Non conosce prodotti, fornitori o listini: per questo può
 * essere riusata senza duplicare la formula nella dashboard.
 */
export function calculateAnnualSavingsFromConsumption(input: {
  lines: readonly ConsumptionSnapshot[];
  periodDays: number;
  baseUnit: BaseUnit;
  unitDifference: string;
}): AnnualSavingsCalculation {
  if (!Number.isFinite(input.periodDays) || input.periodDays <= 0 || input.lines.length === 0) {
    return { ok: false, reason: 'NO_CONSUMPTION' };
  }

  let observedQuantity = new Decimal(0);
  for (const line of input.lines) {
    if (baseDi(line.uomSnapshot) !== input.baseUnit) {
      return { ok: false, reason: 'INCOMPATIBLE_UNIT' };
    }
    if (
      !Number.isInteger(line.quantityPacks) ||
      line.quantityPacks <= 0 ||
      !Number.isInteger(line.packQuantitySnapshot) ||
      line.packQuantitySnapshot <= 0
    ) {
      return { ok: false, reason: 'INVALID_QUANTITY' };
    }
    const perPackage = inUnitaBase(line.unitSizeSnapshot, line.uomSnapshot).mul(
      line.packQuantitySnapshot,
    );
    if (!perPackage.isFinite() || perPackage.lte(0)) {
      return { ok: false, reason: 'INVALID_QUANTITY' };
    }
    observedQuantity = observedQuantity.plus(perPackage.mul(line.quantityPacks));
  }

  if (observedQuantity.lte(0)) return { ok: false, reason: 'NO_CONSUMPTION' };
  const annualizedQuantity = observedQuantity.mul(365).div(input.periodDays);
  const unitDifference = new Decimal(input.unitDifference);
  if (!unitDifference.isFinite() || unitDifference.lt(0)) {
    return { ok: false, reason: 'INVALID_QUANTITY' };
  }

  return {
    ok: true,
    observedQuantity: observedQuantity.toDecimalPlaces(6).toString(),
    annualizedQuantity: annualizedQuantity.toDecimalPlaces(6).toString(),
    amount: annualizedQuantity.mul(unitDifference).toDecimalPlaces(2).toString(),
    baseUnit: input.baseUnit,
    unitDifference: unitDifference.toDecimalPlaces(6).toString(),
  };
}

export function productStatsWindow(periodDays: ProductStatsPeriod, now: Date) {
  return {
    from: new Date(now.getTime() - periodDays * DAY_MS),
    to: new Date(now),
  };
}

interface PurchaseAccumulator {
  orderId: string;
  orderCode: string | null;
  confirmedAt: Date;
  packages: number;
  pieces: number;
  netSpend: Decimal;
}

function validPurchases(
  lines: readonly ProductPurchaseSnapshot[],
  from: Date,
  to: Date,
): ProductPurchaseSnapshot[] {
  return lines.filter(
    (line) =>
      STATI_ACQUISTO.has(line.orderStatus) &&
      line.confirmedAt.getTime() >= from.getTime() &&
      line.confirmedAt.getTime() <= to.getTime() &&
      Number.isInteger(line.quantityPacks) &&
      line.quantityPacks > 0 &&
      Number.isInteger(line.packQuantitySnapshot) &&
      line.packQuantitySnapshot > 0,
  );
}

function groupByOrder(lines: readonly ProductPurchaseSnapshot[]): PurchaseAccumulator[] {
  const groups = new Map<string, PurchaseAccumulator>();
  for (const line of lines) {
    const current = groups.get(line.orderId) ?? {
      orderId: line.orderId,
      orderCode: line.orderCode,
      confirmedAt: line.confirmedAt,
      packages: 0,
      pieces: 0,
      netSpend: new Decimal(0),
    };
    current.packages += line.quantityPacks;
    current.pieces += line.quantityPacks * line.packQuantitySnapshot;
    // Il totale fotografato e la cifra realmente confermata. Ricalcolarlo dal
    // prezzo unitario perderebbe l'arrotondamento al centesimo della riga.
    current.netSpend = current.netSpend.plus(line.lineTotalNet);
    groups.set(line.orderId, current);
  }
  return [...groups.values()].sort((a, b) => a.confirmedAt.getTime() - b.confirmedAt.getTime());
}

function frequencyDays(purchases: readonly PurchaseAccumulator[]): string | null {
  if (purchases.length < 2) return null;
  const elapsed = purchases.at(-1)!.confirmedAt.getTime() - purchases[0]!.confirmedAt.getTime();
  return new Decimal(elapsed)
    .div(DAY_MS)
    .div(purchases.length - 1)
    .toDecimalPlaces(1)
    .toString();
}

function mapCurrentPrice(input: CurrentProductPriceInput | null): ProductCurrentPrice | null {
  if (!input || input.packQuantity <= 0) return null;
  return {
    supplierProductId: input.supplierProductId,
    supplierName: input.supplierName,
    pricePerPackage: new Decimal(input.pricePerPackage).toString(),
    packQuantity: input.packQuantity,
    pricePerPiece: new Decimal(input.pricePerPackage)
      .div(input.packQuantity)
      .toDecimalPlaces(6)
      .toString(),
    stale: input.stale,
    validFrom: input.validFrom.toISOString(),
  };
}

function compareWithCurrent(
  lines: readonly ProductPurchaseSnapshot[],
  averagePerPackage: Decimal | null,
  averagePerPiece: Decimal | null,
  current: ProductCurrentPrice | null,
): ProductPriceComparison | null {
  if (!current || !averagePerPackage || !averagePerPiece) return null;

  const samePackage = lines.every((line) => line.packQuantitySnapshot === current.packQuantity);
  const basis = samePackage ? ('PACKAGE' as const) : ('PIECE' as const);
  const average = samePackage ? averagePerPackage : averagePerPiece;
  const currentValue = new Decimal(samePackage ? current.pricePerPackage : current.pricePerPiece);
  if (average.eq(0)) return null;

  return {
    basis,
    averagePaid: average.toDecimalPlaces(6).toString(),
    currentPrice: currentValue.toDecimalPlaces(6).toString(),
    absoluteChange: currentValue.minus(average).toDecimalPlaces(6).toString(),
    percentageChange: currentValue
      .minus(average)
      .div(average)
      .mul(100)
      .toDecimalPlaces(2)
      .toString(),
  };
}

function estimateAnnualSavings(
  lines: readonly ProductPurchaseSnapshot[],
  periodDays: ProductStatsPeriod,
  current: CurrentProductPriceInput | null,
): {
  estimate: ProductAnnualSavingsEstimate | null;
  reason: string | null;
} {
  if (lines.length === 0) {
    return {
      estimate: null,
      reason: 'Servono acquisti nel periodo per misurare il consumo da annualizzare.',
    };
  }
  if (
    !current ||
    current.unitDifference === null ||
    current.unitDifference === undefined ||
    !current.baseUnit ||
    !current.alternativeSupplierName
  ) {
    return {
      estimate: null,
      reason: 'Servono almeno due offerte correnti confrontabili.',
    };
  }

  const calculation = calculateAnnualSavingsFromConsumption({
    lines,
    periodDays,
    baseUnit: current.baseUnit,
    unitDifference: current.unitDifference,
  });
  if (!calculation.ok) {
    const reason =
      calculation.reason === 'INCOMPATIBLE_UNIT'
        ? 'Gli acquisti storici e le offerte correnti usano unità non confrontabili: la stima non viene inventata.'
        : calculation.reason === 'INVALID_QUANTITY'
          ? 'Uno snapshot non contiene una quantità fisica valida.'
          : 'Il consumo osservato nel periodo è pari a zero.';
    return { estimate: null, reason };
  }

  return {
    estimate: {
      amount: calculation.amount,
      observedQuantity: calculation.observedQuantity,
      annualizedQuantity: calculation.annualizedQuantity,
      baseUnit: calculation.baseUnit,
      unitDifference: calculation.unitDifference,
      bestSupplierName: current.supplierName,
      alternativeSupplierName: current.alternativeSupplierName,
    },
    reason: null,
  };
}

function mapPoint(purchase: PurchaseAccumulator): ProductPurchasePoint {
  return {
    orderId: purchase.orderId,
    orderCode: purchase.orderCode,
    confirmedAt: purchase.confirmedAt.toISOString(),
    packages: purchase.packages,
    pieces: purchase.pieces,
    netSpend: purchase.netSpend.toDecimalPlaces(2).toString(),
    weightedAveragePaid: purchase.netSpend.div(purchase.packages).toDecimalPlaces(4).toString(),
  };
}

/**
 * Aggregazione pura delle statistiche prodotto.
 *
 * Tutti i numeri storici arrivano dagli snapshot dell'ordine. Il solo dato
 * vivo e il prezzo corrente, passato esplicitamente per rendere visibile il
 * confine e mantenere il calcolo riproducibile nei test.
 */
export function calculateProductPurchaseStats(input: {
  productId: string;
  periodDays: ProductStatsPeriod;
  now: Date;
  lines: readonly ProductPurchaseSnapshot[];
  currentPrice: CurrentProductPriceInput | null;
}): ProductPurchaseStats {
  const window = productStatsWindow(input.periodDays, input.now);
  const lines = validPurchases(input.lines, window.from, window.to);
  const purchases = groupByOrder(lines);
  const packages = lines.reduce((total, line) => total + line.quantityPacks, 0);
  const pieces = lines.reduce(
    (total, line) => total + line.quantityPacks * line.packQuantitySnapshot,
    0,
  );
  const netSpend = lines.reduce((total, line) => total.plus(line.lineTotalNet), new Decimal(0));
  const averagePerPackage = packages > 0 ? netSpend.div(packages) : null;
  const averagePerPiece = pieces > 0 ? netSpend.div(pieces) : null;
  const currentPrice = mapCurrentPrice(input.currentPrice);
  const annualSavings = estimateAnnualSavings(lines, input.periodDays, input.currentPrice);

  return {
    productId: input.productId,
    periodDays: input.periodDays,
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    packages,
    pieces,
    netSpend: netSpend.toDecimalPlaces(2).toString(),
    orderCount: purchases.length,
    lastPurchasedAt: purchases.at(-1)?.confirmedAt.toISOString() ?? null,
    averageFrequencyDays: frequencyDays(purchases),
    weightedAveragePaid: averagePerPackage?.toDecimalPlaces(4).toString() ?? null,
    weightedAveragePaidPerPiece: averagePerPiece?.toDecimalPlaces(6).toString() ?? null,
    currentPrice,
    comparison: compareWithCurrent(lines, averagePerPackage, averagePerPiece, currentPrice),
    estimatedAnnualSavings: annualSavings.estimate,
    estimatedAnnualSavingsReason: annualSavings.reason,
    purchases: purchases.map(mapPoint),
  };
}
