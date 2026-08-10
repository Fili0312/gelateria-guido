import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateAnnualSavingsFromConsumption,
  calculateProductPurchaseStats,
  type ProductPurchaseSnapshot,
} from './product-stats';

const NOW = new Date('2026-08-10T12:00:00.000Z');

function line(overrides: Partial<ProductPurchaseSnapshot> = {}): ProductPurchaseSnapshot {
  return {
    orderId: 'ordine-1',
    orderCode: 'ORD-0001',
    orderStatus: 'CONFIRMED',
    confirmedAt: new Date('2026-08-01T12:00:00.000Z'),
    quantityPacks: 1,
    packQuantitySnapshot: 1,
    unitSizeSnapshot: '1',
    uomSnapshot: 'PIECE',
    unitPriceNetSnapshot: '10',
    lineTotalNet: '10',
    ...overrides,
  };
}

function calculate(
  lines: ProductPurchaseSnapshot[],
  currentPrice: Parameters<typeof calculateProductPurchaseStats>[0]['currentPrice'] = null,
) {
  return calculateProductPurchaseStats({
    productId: 'prodotto-1',
    periodDays: 365,
    now: NOW,
    lines,
    currentPrice,
  });
}

describe('statistiche acquisti prodotto', () => {
  it('riproduce 48 confezioni, 450 euro, media 9,375 e aumento 8,8%', () => {
    const stats = calculate(
      [line({ quantityPacks: 48, unitPriceNetSnapshot: '9.375', lineTotalNet: '450' })],
      {
        supplierProductId: 'offerta-1',
        supplierName: 'Fornitore Uno',
        pricePerPackage: '10.20',
        packQuantity: 1,
        stale: false,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
      },
    );

    assert.equal(stats.packages, 48);
    assert.equal(stats.pieces, 48);
    assert.equal(stats.netSpend, '450');
    assert.equal(stats.weightedAveragePaid, '9.375');
    assert.equal(stats.currentPrice?.pricePerPackage, '10.2');
    assert.equal(stats.comparison?.basis, 'PACKAGE');
    assert.equal(stats.comparison?.percentageChange, '8.8');
  });

  it('conta un ordine una volta anche se contiene due offerte dello stesso prodotto', () => {
    const stats = calculate([
      line({ quantityPacks: 2, packQuantitySnapshot: 6, lineTotalNet: '20' }),
      line({ quantityPacks: 1, packQuantitySnapshot: 12, lineTotalNet: '18' }),
    ]);

    assert.equal(stats.orderCount, 1);
    assert.equal(stats.purchases.length, 1);
    assert.equal(stats.packages, 3);
    assert.equal(stats.pieces, 24);
    assert.equal(stats.netSpend, '38');
  });

  it('ignora bozze, annullati e righe fuori periodo', () => {
    const stats = calculate([
      line(),
      line({ orderId: 'bozza', orderStatus: 'DRAFT' }),
      line({ orderId: 'annullato', orderStatus: 'CANCELLED' }),
      line({
        orderId: 'vecchio',
        confirmedAt: new Date('2025-08-09T11:59:59.000Z'),
      }),
    ]);

    assert.equal(stats.orderCount, 1);
    assert.equal(stats.netSpend, '10');
  });

  it('calcola la frequenza media fra ordini distinti', () => {
    const stats = calculate([
      line({ orderId: 'a', confirmedAt: new Date('2026-07-01T12:00:00.000Z') }),
      line({ orderId: 'b', confirmedAt: new Date('2026-07-11T12:00:00.000Z') }),
      line({ orderId: 'c', confirmedAt: new Date('2026-07-31T12:00:00.000Z') }),
    ]);

    assert.equal(stats.averageFrequencyDays, '15');
    assert.equal(stats.lastPurchasedAt, '2026-07-31T12:00:00.000Z');
  });

  it('con confezioni cambiate confronta il prezzo per pezzo', () => {
    const stats = calculate(
      [line({ quantityPacks: 2, packQuantitySnapshot: 12, lineTotalNet: '48' })],
      {
        supplierProductId: 'offerta-24',
        supplierName: 'Fornitore Due',
        pricePerPackage: '52.80',
        packQuantity: 24,
        stale: false,
        validFrom: new Date('2026-08-01T00:00:00.000Z'),
      },
    );

    assert.equal(stats.weightedAveragePaid, '24');
    assert.equal(stats.weightedAveragePaidPerPiece, '2');
    assert.equal(stats.currentPrice?.pricePerPiece, '2.2');
    assert.equal(stats.comparison?.basis, 'PIECE');
    assert.equal(stats.comparison?.percentageChange, '10');
  });

  it('senza acquisti restituisce zeri espliciti e nessuna media inventata', () => {
    const stats = calculate([]);
    assert.equal(stats.packages, 0);
    assert.equal(stats.pieces, 0);
    assert.equal(stats.netSpend, '0');
    assert.equal(stats.orderCount, 0);
    assert.equal(stats.weightedAveragePaid, null);
    assert.equal(stats.averageFrequencyDays, null);
    assert.equal(stats.comparison, null);
  });

  it('annualizza il consumo fisico e applica la differenza unitaria corrente', () => {
    // 2 colli × 12 bottiglie × 33 cl = 7,92 L osservati in 30 giorni.
    // 7,92 × 365/30 = 96,36 L/anno; a 0,50 €/L = 48,18 €.
    const estimate = calculateAnnualSavingsFromConsumption({
      lines: [
        {
          quantityPacks: 2,
          packQuantitySnapshot: 12,
          unitSizeSnapshot: '33',
          uomSnapshot: 'CL',
        },
      ],
      periodDays: 30,
      baseUnit: 'L',
      unitDifference: '0.50',
    });

    assert.equal(estimate.ok, true);
    if (!estimate.ok) return;
    assert.equal(estimate.observedQuantity, '7.92');
    assert.equal(estimate.annualizedQuantity, '96.36');
    assert.equal(estimate.amount, '48.18');
  });

  it('non stima un risparmio fra unità fisiche incompatibili', () => {
    const estimate = calculateAnnualSavingsFromConsumption({
      lines: [
        {
          quantityPacks: 1,
          packQuantitySnapshot: 1,
          unitSizeSnapshot: '1',
          uomSnapshot: 'KG',
        },
      ],
      periodDays: 365,
      baseUnit: 'L',
      unitDifference: '2',
    });

    assert.deepEqual(estimate, { ok: false, reason: 'INCOMPATIBLE_UNIT' });
  });
});
