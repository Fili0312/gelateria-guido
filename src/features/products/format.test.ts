import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupplierOffer } from './dto';
import { countComparableOffers } from './dto';
import {
  catenaSconti,
  contenutoConfezione,
  formatoConfezione,
  formatoUnitario,
  prezzoUnitario,
} from './format';

function offerta(parziale: Partial<SupplierOffer> = {}): SupplierOffer {
  return {
    id: 'o1',
    supplierId: 's1',
    supplierName: 'Cecconi',
    supplierActive: true,
    supplierCode: '20561',
    rawName: 'ALISEA NATURALE CL.50 PET',
    description: null,
    brand: null,
    category: null,
    packagingType: null,
    packQuantity: 24,
    packQuantityConfirmed: true,
    unitSize: '50',
    unitOfMeasure: 'CL',
    contentPerPack: '12',
    baseUnit: 'L',
    vatRate: '22',
    gtin: null,
    active: true,
    matchStatus: 'CONFIRMED',
    productId: 'p1',
    price: {
      priceList: '5.90',
      discounts: [10],
      priceNet: '5.31',
      unitPrice: '0.4425',
      unitPriceBasis: 'PER_L',
      validFrom: '2026-08-07',
    },
    ...parziale,
  };
}

describe('formato', () => {
  it('mostra il formato del pezzo', () => {
    assert.equal(formatoUnitario('33', 'CL'), '33 cl');
    assert.equal(formatoUnitario('0.7', 'L'), '0,7 L');
  });

  it('un pezzo singolo non ha un formato da mostrare', () => {
    assert.equal(formatoUnitario('1', 'PIECE'), 'al pezzo');
  });

  it('unisce formato e confezione solo quando la confezione conta', () => {
    assert.equal(formatoConfezione('33', 'CL', 24), '33 cl × 24');
    assert.equal(formatoConfezione('70', 'CL', 1), '70 cl');
  });

  it('mostra il contenuto complessivo in unita base', () => {
    assert.equal(contenutoConfezione('12', 'L'), '12 L');
    assert.equal(contenutoConfezione('3.96', 'L'), '3,96 L');
  });
});

describe('prezzoUnitario', () => {
  it('mostra il prezzo per unita quando i dati ci sono', () => {
    assert.match(prezzoUnitario(offerta()), /0,4425/);
  });

  it('senza prezzo non inventa niente', () => {
    assert.equal(prezzoUnitario(offerta({ price: null })), '—');
  });

  it('con la confezione ignota dice perche manca, invece di mostrare un numero', () => {
    // E' il caso che il modello prevede: il prezzo al litro di un collo di
    // cui non si sa quante bottiglie contenga sarebbe un'ipotesi travestita
    // da dato.
    assert.equal(prezzoUnitario(offerta({ packQuantityConfirmed: false })), 'confezione da definire');
  });
});

describe('catenaSconti', () => {
  it('mostra la cascata come la scrive il listino', () => {
    assert.equal(catenaSconti([6, 10]), '6% + 10%');
  });

  it('salta gli zeri e i vuoti', () => {
    assert.equal(catenaSconti([10, 0]), '10%');
    assert.equal(catenaSconti([]), '—');
  });
});

describe('countComparableOffers', () => {
  it('conta solo le offerte con la confezione dichiarata', () => {
    const offerte = [
      offerta({ id: 'a' }),
      offerta({ id: 'b', packQuantityConfirmed: false }),
      offerta({ id: 'c' }),
    ];
    assert.equal(countComparableOffers(offerte), 2);
  });
});
