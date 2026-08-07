import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { supplierHasLinkedData, supplierLinkedDataCount } from './dto';

const EMPTY_COUNTS = {
  priceLists: 0,
  supplierProducts: 0,
  importProfiles: 0,
  orderLines: 0,
  orderDocuments: 0,
  emailDeliveries: 0,
  aliases: 0,
};

describe('policy cancellazione fornitore', () => {
  it('considera cancellabile soltanto un fornitore senza alcun dato collegato', () => {
    assert.equal(supplierHasLinkedData(EMPTY_COUNTS), false);
    assert.equal(supplierLinkedDataCount(EMPTY_COUNTS), 0);
  });

  for (const relation of Object.keys(EMPTY_COUNTS) as Array<keyof typeof EMPTY_COUNTS>) {
    it(`blocca la cancellazione quando esiste la relazione ${relation}`, () => {
      const counts = { ...EMPTY_COUNTS, [relation]: 1 };
      assert.equal(supplierHasLinkedData(counts), true);
      assert.equal(supplierLinkedDataCount(counts), 1);
    });
  }
});
