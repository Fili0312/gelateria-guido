import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sameCommercialPrice, type CommercialPriceSnapshot } from './snapshot';

const base: CommercialPriceSnapshot = {
  priceList: '9.5000',
  discounts: [6, 10],
  priceNet: '8.04',
  vatRate: '22.00',
  currency: 'EUR',
  unitPrice: '1.005000',
  unitPriceBasis: 'PER_L',
};

describe('idempotenza del prezzo', () => {
  it('ignora differenze soltanto di rappresentazione decimale', () => {
    assert.equal(
      sameCommercialPrice(base, {
        ...base,
        priceList: '9.5',
        priceNet: '8.0400',
        vatRate: '22',
        unitPrice: '1.005',
      }),
      true,
    );
  });

  it('una seconda scrittura identica e riconoscibile come no-op', () => {
    assert.equal(sameCommercialPrice(base, { ...base, discounts: [...base.discounts] }), true);
  });

  it('non confonde una correzione di sconti o IVA con un duplicato', () => {
    assert.equal(sameCommercialPrice(base, { ...base, discounts: [15.4] }), false);
    assert.equal(sameCommercialPrice(base, { ...base, vatRate: '10' }), false);
  });
});
