import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { netPriceForWrite, PriceStorageRangeError, priceValuesForWrite } from './calculation';

describe('netto da salvare', () => {
  it('lo calcola dagli sconti quando il documento non lo dichiara', () => {
    assert.equal(
      netPriceForWrite({ priceList: '5.25', discounts: [10] }).toFixed(2),
      '4.72',
      "usa l'arrotondamento half-even verificato sui listini",
    );
  });

  it('conserva il netto dichiarato anche se differisce dal calcolo', () => {
    assert.equal(
      netPriceForWrite({ priceList: '5.25', discounts: [10], priceNet: '4.73' }).toFixed(2),
      '4.73',
    );
  });
});

describe('limiti dei decimali salvati', () => {
  it('intercetta un netto che gli sconti arrotondano a zero', () => {
    assert.throws(
      () => priceValuesForWrite({ priceList: '0.0001', discounts: [99] }, '1', 'PIECE'),
      (error) => error instanceof PriceStorageRangeError && error.field === 'priceNet',
    );
  });

  it('intercetta un unitario oltre Decimal(14,6) prima del database', () => {
    assert.throws(
      () => priceValuesForWrite({ priceList: '100', discounts: [] }, '0.0000001', 'KG'),
      (error) => error instanceof PriceStorageRangeError && error.field === 'priceList',
    );
  });

  it('trasforma anche una confezione corrotta in un errore di range noto', () => {
    assert.throws(
      () => priceValuesForWrite({ priceList: '10', discounts: [] }, '0', 'L'),
      (error) => error instanceof PriceStorageRangeError && error.field === 'priceList',
    );
  });

  it('restituisce valori pronti per le colonne quando sono nel range', () => {
    const result = priceValuesForWrite({ priceList: '10', discounts: [10] }, '2', 'L');
    assert.equal(result.net.toFixed(2), '9.00');
    assert.equal(result.unit.valore.toFixed(6), '4.500000');
    assert.equal(result.unit.basis, 'PER_L');
  });
});
