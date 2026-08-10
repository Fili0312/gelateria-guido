import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateDashboardOrders,
  dashboardMonths,
  resolveDashboardProductId,
  type DashboardOrderInput,
} from './aggregates';

function history(): DashboardOrderInput[] {
  return [
    {
      id: 'order-2',
      confirmedAt: new Date('2026-08-08T12:00:00.000Z'),
      totalNet: '54.00',
      lines: [
        {
          supplierProductId: 'offer-beer',
          productId: 'beer',
          supplierId: 'supplier-a',
          nameSnapshot: 'Birra di allora',
          supplierNameSnapshot: 'Fornitore A di allora',
          packQuantitySnapshot: 12,
          unitSizeSnapshot: '33',
          uomSnapshot: 'CL',
          quantityPacks: 4,
          lineTotalNet: '36.00',
          department: { id: 'bar', name: 'Bar', color: '#123456' },
        },
        {
          supplierProductId: 'offer-cones',
          productId: 'cones',
          supplierId: 'supplier-b',
          nameSnapshot: 'Coni',
          supplierNameSnapshot: 'Fornitore B',
          packQuantitySnapshot: 50,
          unitSizeSnapshot: '1',
          uomSnapshot: 'PIECE',
          quantityPacks: 2,
          lineTotalNet: '18.00',
          department: null,
        },
      ],
    },
    {
      id: 'order-1',
      confirmedAt: new Date('2026-07-10T12:00:00.000Z'),
      totalNet: '9.00',
      lines: [
        {
          supplierProductId: 'offer-beer',
          productId: 'beer',
          supplierId: 'supplier-a',
          nameSnapshot: 'Vecchio nome birra',
          supplierNameSnapshot: 'Vecchio nome fornitore',
          packQuantitySnapshot: 12,
          unitSizeSnapshot: '33',
          uomSnapshot: 'CL',
          quantityPacks: 1,
          lineTotalNet: '9.00',
          department: { id: 'bar', name: 'Bar', color: '#123456' },
        },
      ],
    },
  ];
}

describe('aggregati dashboard', () => {
  it('attribuisce un vecchio ordine al prodotto scelto da un rematch successivo', () => {
    assert.equal(resolveDashboardProductId('product-before', 'product-after'), 'product-after');
    assert.equal(resolveDashboardProductId(null, 'matched-later'), 'matched-later');
    assert.equal(resolveDashboardProductId('historical-fallback', null), 'historical-fallback');
  });

  it('costruisce i mesi italiani e conserva anche quelli vuoti', () => {
    const months = dashboardMonths(new Date('2026-08-10T23:30:00-07:00'), 3);
    assert.deepEqual(
      months.map((month) => month.key),
      ['2026-06', '2026-07', '2026-08'],
    );

    const result = aggregateDashboardOrders(history(), months);
    assert.deepEqual(
      result.spend.map((point) => [point.key, point.net, point.orders]),
      [
        ['2026-06', '0.00', 0],
        ['2026-07', '9.00', 1],
        ['2026-08', '54.00', 1],
      ],
    );
  });

  it('assegna alla nuova mensilità italiana un ordine ancora al giorno prima in UTC', () => {
    const months = dashboardMonths(new Date('2026-08-31T22:30:00.000Z'), 2);
    assert.deepEqual(
      months.map((month) => [month.key, month.from.toISOString()]),
      [
        ['2026-08', '2026-07-31T22:00:00.000Z'],
        ['2026-09', '2026-08-31T22:00:00.000Z'],
      ],
    );
    const order = history()[0]!;
    order.confirmedAt = new Date('2026-08-31T22:30:00.000Z');
    const result = aggregateDashboardOrders([order], months);
    assert.deepEqual(
      result.spend.map((point) => [point.key, point.net]),
      [
        ['2026-08', '0.00'],
        ['2026-09', '54.00'],
      ],
    );
  });

  it('usa quantità, nomi e importi fotografati negli ordini', () => {
    const result = aggregateDashboardOrders(
      history(),
      dashboardMonths(new Date('2026-08-10T00:00:00.000Z'), 2),
    );
    const beer = result.topProducts.find((product) => product.productId === 'beer');

    assert.ok(beer);
    assert.equal(beer.name, 'Birra di allora');
    assert.equal(beer.packs, 5);
    assert.equal(beer.pieces, 60);
    assert.equal(beer.net, '45.00');
    assert.equal(beer.orders, 2);
    assert.equal(beer.consumptionByBase.L, '19.8');
    assert.equal(result.topProducts[0]?.productId, 'beer');
  });

  it('conta un ordine una sola volta per fornitore e calcola quote e reparti', () => {
    const result = aggregateDashboardOrders(
      history(),
      dashboardMonths(new Date('2026-08-10T00:00:00.000Z'), 2),
    );
    const supplierA = result.topSuppliers.find((supplier) => supplier.supplierId === 'supplier-a');

    assert.ok(supplierA);
    assert.equal(supplierA.name, 'Fornitore A di allora');
    assert.equal(supplierA.orders, 2);
    assert.equal(supplierA.net, '45.00');
    assert.equal(supplierA.share, 71.43);
    assert.deepEqual(
      result.departments.map((department) => [department.name, department.net]),
      [
        ['Bar', '45.00'],
        ['Senza reparto', '18.00'],
      ],
    );
  });

  it('mantiene cliccabili anche le vecchie righe non ancora abbinate', () => {
    const order = history()[0]!;
    order.lines[0] = {
      ...order.lines[0]!,
      productId: null,
      supplierProductId: 'unmatched-offer',
    };
    const result = aggregateDashboardOrders(
      [order],
      dashboardMonths(new Date('2026-08-10T00:00:00.000Z'), 1),
    );

    const unmatched = result.topProducts.find((product) => product.productId === null);
    assert.ok(unmatched);
    assert.equal(unmatched.supplierId, 'supplier-a');
  });
});
