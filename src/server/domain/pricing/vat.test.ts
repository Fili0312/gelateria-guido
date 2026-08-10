import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizzaPrezzoIva, PrezzoIvaError } from './vat';

describe('catena dell’aliquota IVA', () => {
  it('usa prezzo, poi offerta, poi fornitore, poi organizzazione', () => {
    const base = {
      prezzoQuotato: '10',
      originePrezzo: 'PRICE_LIST',
      pricesIncludeVat: false,
      aliquotaPrezzo: '4',
      aliquotaOfferta: '10',
      aliquotaFornitore: '20',
      aliquotaOrganizzazione: '22',
    } as const;

    assert.equal(normalizzaPrezzoIva(base).aliquotaIva.toString(), '4');
    assert.equal(normalizzaPrezzoIva(base).fonteAliquota, 'PREZZO');
    assert.equal(normalizzaPrezzoIva({ ...base, aliquotaPrezzo: null }).fonteAliquota, 'OFFERTA');
    assert.equal(
      normalizzaPrezzoIva({ ...base, aliquotaPrezzo: null, aliquotaOfferta: null }).fonteAliquota,
      'FORNITORE',
    );
    assert.equal(
      normalizzaPrezzoIva({
        ...base,
        aliquotaPrezzo: null,
        aliquotaOfferta: null,
        aliquotaFornitore: null,
      }).fonteAliquota,
      'ORGANIZZAZIONE',
    );
  });

  it('non trasforma lo zero in un valore assente', () => {
    const prezzo = normalizzaPrezzoIva({
      prezzoQuotato: '10',
      originePrezzo: 'PRICE_LIST',
      pricesIncludeVat: true,
      aliquotaPrezzo: 0,
      aliquotaOrganizzazione: 22,
    });
    assert.equal(prezzo.aliquotaIva.toString(), '0');
    assert.equal(prezzo.prezzoNetto.toString(), '10');
  });
});

describe('rappresentazione imponibile', () => {
  it('un prezzo IVA esclusa resta netto e il lordo si ricava una volta', () => {
    const prezzo = normalizzaPrezzoIva({
      prezzoQuotato: '10',
      originePrezzo: 'PRICE_LIST',
      pricesIncludeVat: false,
      aliquotaOrganizzazione: 22,
    });
    assert.equal(prezzo.prezzoNetto.toFixed(2), '10.00');
    assert.equal(prezzo.prezzoLordo.toFixed(2), '12.20');
  });

  it('un prezzo IVA inclusa viene scorporato e non tassato due volte', () => {
    const prezzo = normalizzaPrezzoIva({
      prezzoQuotato: '12.20',
      originePrezzo: 'PRICE_LIST',
      pricesIncludeVat: true,
      aliquotaOrganizzazione: 22,
    });
    assert.equal(prezzo.prezzoNetto.toFixed(2), '10.00');
    assert.equal(prezzo.prezzoLordo.toFixed(2), '12.20');
  });

  it('mantiene quattro decimali nell’imponibile normalizzato', () => {
    const prezzo = normalizzaPrezzoIva({
      prezzoQuotato: '10',
      originePrezzo: 'PRICE_LIST',
      pricesIncludeVat: true,
      aliquotaOrganizzazione: 22,
    });
    assert.equal(prezzo.prezzoNetto.toFixed(4), '8.1967');
  });
});

describe('dati ambigui o impossibili', () => {
  it('blocca l’assenza completa dell’aliquota', () => {
    assert.throws(
      () =>
        normalizzaPrezzoIva({
          prezzoQuotato: '10',
          originePrezzo: 'PRICE_LIST',
          pricesIncludeVat: true,
        }),
      PrezzoIvaError,
    );
  });

  it('blocca un’aliquota esplicita fuori intervallo invece di saltarla', () => {
    assert.throws(
      () =>
        normalizzaPrezzoIva({
          prezzoQuotato: '10',
          originePrezzo: 'PRICE_LIST',
          pricesIncludeVat: false,
          aliquotaPrezzo: 101,
          aliquotaOrganizzazione: 22,
        }),
      /compresa fra 0 e 100/,
    );
  });

  it('blocca prezzi negativi', () => {
    assert.throws(
      () =>
        normalizzaPrezzoIva({
          prezzoQuotato: '-1',
          originePrezzo: 'PRICE_LIST',
          pricesIncludeVat: false,
          aliquotaOrganizzazione: 22,
        }),
      /non può essere negativo/,
    );
  });
});

describe('origine del prezzo', () => {
  it('un prezzo MANUAL è già netto anche se il fornitore espone listini lordi', () => {
    const prezzo = normalizzaPrezzoIva({
      prezzoQuotato: '10',
      originePrezzo: 'MANUAL',
      pricesIncludeVat: true,
      aliquotaOrganizzazione: 22,
    });
    assert.equal(prezzo.prezzoNetto.toFixed(2), '10.00');
    assert.equal(prezzo.prezzoLordo.toFixed(2), '12.20');
  });

  it('anche un prezzo ORDER conserva l’imponibile già fotografato', () => {
    const prezzo = normalizzaPrezzoIva({
      prezzoQuotato: '10',
      originePrezzo: 'ORDER',
      pricesIncludeVat: true,
      aliquotaOrganizzazione: 22,
    });
    assert.equal(prezzo.prezzoNetto.toFixed(2), '10.00');
  });
});
