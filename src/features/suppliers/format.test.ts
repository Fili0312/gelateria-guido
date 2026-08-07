import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDecimalIt, formatEuro, linkedDataSummary, supplierInitials } from './format';

describe('presentazione fornitori', () => {
  it('formatta decimali ed euro senza conversioni floating point', () => {
    assert.equal(formatDecimalIt('22.00', '%'), '22%');
    assert.equal(formatDecimalIt('4.50', '%'), '4,5%');
    assert.equal(formatDecimalIt(null, '%'), 'Non indicato');
    assert.equal(formatEuro('1234.5'), '€ 1.234,50');
    assert.equal(formatEuro(null), 'Nessun minimo');
  });

  it('ricava iniziali corte e leggibili', () => {
    assert.equal(supplierInitials('Cecconi Distribuzione'), 'CD');
    assert.equal(supplierInitials('  Barzelli '), 'B');
  });

  it('descrive soltanto i collegamenti presenti', () => {
    assert.deepEqual(
      linkedDataSummary({
        priceLists: 2,
        supplierProducts: 1,
        importProfiles: 0,
        orderLines: 0,
        orderDocuments: 0,
        emailDeliveries: 0,
        aliases: 0,
      }),
      ['1 prodotto collegato', '2 listini'],
    );
  });
});
