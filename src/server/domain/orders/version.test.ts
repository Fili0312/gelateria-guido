import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { versionePrezziOrdine } from './version';

describe('versione dei prezzi mostrati nel riepilogo', () => {
  const righe = [
    {
      lineId: 'riga-b',
      quantityPacks: 2,
      supplierProductId: 'offerta-2',
      supplierId: 'fornitore-2',
      productId: 'prodotto-2',
      nameSnapshot: 'Prodotto 2',
      supplierNameSnapshot: 'Fornitore 2',
      supplierCodeSnapshot: 'F-2',
      packQuantitySnapshot: 6,
      packagingTypeSnapshot: 'CT',
      unitSizeSnapshot: '1',
      uomSnapshot: 'KG',
      currentPriceId: 'prezzo-2',
      priceNet: '12.00',
      vatRate: '10',
      unitPriceBasisSnapshot: 'KG',
    },
    {
      lineId: 'riga-a',
      quantityPacks: 1,
      supplierProductId: 'offerta-1',
      supplierId: 'fornitore-1',
      productId: 'prodotto-1',
      nameSnapshot: 'Prodotto 1',
      supplierNameSnapshot: 'Fornitore 1',
      supplierCodeSnapshot: 'F-1',
      packQuantitySnapshot: 12,
      packagingTypeSnapshot: 'CT',
      unitSizeSnapshot: '0.5',
      uomSnapshot: 'L',
      currentPriceId: 'prezzo-1',
      priceNet: '10.00',
      vatRate: '22',
      unitPriceBasisSnapshot: 'L',
    },
  ];

  it('è deterministica anche se il database restituisce le righe in un altro ordine', () => {
    assert.equal(versionePrezziOrdine(righe), versionePrezziOrdine([...righe].reverse()));
    assert.match(versionePrezziOrdine(righe), /^[a-f0-9]{64}$/);
  });

  it('cambia quando cambia anche un solo currentPriceId', () => {
    assert.notEqual(
      versionePrezziOrdine(righe),
      versionePrezziOrdine([righe[0]!, { ...righe[1]!, currentPriceId: 'prezzo-3' }]),
    );
  });

  it('distingue un prezzo assente da un prezzo corrente', () => {
    const base = {
      lineId: 'riga-a',
      quantityPacks: 1,
      supplierProductId: 'offerta-1',
      supplierId: 'fornitore-1',
      productId: 'prodotto-1',
      nameSnapshot: 'Prodotto 1',
      supplierNameSnapshot: 'Fornitore 1',
      supplierCodeSnapshot: null,
      packQuantitySnapshot: 12,
      packagingTypeSnapshot: 'CT',
      unitSizeSnapshot: '0.5',
      uomSnapshot: 'L',
      priceNet: null,
      vatRate: null,
      unitPriceBasisSnapshot: null,
    };
    assert.notEqual(
      versionePrezziOrdine([{ ...base, currentPriceId: null }]),
      versionePrezziOrdine([
        { ...base, currentPriceId: 'prezzo-1', priceNet: '10.00', vatRate: '22' },
      ]),
    );
  });

  it('cambia se cambia il fallback IVA senza cambiare currentPriceId', () => {
    assert.notEqual(
      versionePrezziOrdine(righe),
      versionePrezziOrdine([righe[0]!, { ...righe[1]!, vatRate: '10' }]),
    );
  });

  it('cambia se cambia l’imponibile operativo senza cambiare currentPriceId', () => {
    assert.notEqual(
      versionePrezziOrdine(righe),
      versionePrezziOrdine([righe[0]!, { ...righe[1]!, priceNet: '10.01' }]),
    );
  });

  it('firma ogni metadato rifotografato dalla conferma', () => {
    const base = righe[1]!;
    const mutazioni = [
      { quantityPacks: 2 },
      { supplierProductId: 'offerta-altra' },
      { supplierId: 'fornitore-altro' },
      { productId: 'prodotto-altro' },
      { nameSnapshot: 'Nome aggiornato' },
      { supplierNameSnapshot: 'Fornitore aggiornato' },
      { supplierCodeSnapshot: 'COD-NUOVO' },
      { packQuantitySnapshot: 24 },
      { unitSizeSnapshot: '1' },
      { uomSnapshot: 'KG' },
      { unitPriceBasisSnapshot: 'KG' },
    ];

    for (const mutazione of mutazioni) {
      assert.notEqual(
        versionePrezziOrdine([base]),
        versionePrezziOrdine([{ ...base, ...mutazione }]),
        `la firma non è cambiata per ${Object.keys(mutazione)[0]}`,
      );
    }
  });
});
