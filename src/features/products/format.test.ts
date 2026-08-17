import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CatalogPrice, SupplierOffer } from './dto';
import { countComparableOffers } from './dto';
import {
  catenaSconti,
  confezioneDelPrezzo,
  contenutoConfezione,
  etichettaImballo,
  formatoConfezione,
  formatoUnitario,
  costoRealeConfezione,
  prezzoUnitario,
  prezzoUnitarioDiCatalogo,
} from './format';

function prezzoDiCatalogo(parziale: Partial<CatalogPrice> = {}): CatalogPrice {
  return {
    supplierProductId: 'o1',
    supplierName: 'Cecconi',
    priceNet: '5.31',
    unitPrice: '0.4425',
    unitPriceBasis: 'PER_L',
    packQuantity: 24,
    packagingType: 'CT',
    unitSize: '50',
    unitOfMeasure: 'CL',
    packQuantityConfirmed: true,
    offersWithPrice: 1,
    compared: false,
    savingPct: null,
    ...parziale,
  };
}

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
    extraDiscountExcluded: false,
    extraDiscountPct: null,
    scontoExtraApplicato: '0',
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
    assert.equal(
      prezzoUnitario(offerta({ packQuantityConfirmed: false })),
      'confezione da definire',
    );
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

describe('il prezzo unitario si scrive attaccato al denominatore', () => {
  it('«0,4425 €/L», non «0,4425 € /L»', () => {
    // In italiano il simbolo va in fondo: lo spazio in mezzo sembra un refuso,
    // e su un elenco di centoquaranta righe lo sembra centoquaranta volte.
    const scritto = prezzoUnitarioDiCatalogo(prezzoDiCatalogo())!;
    assert.ok(!/\s\/L$/.test(scritto), `spazio di troppo in «${scritto}»`);
    assert.match(scritto, /0,4425.*€\/L$/);
  });

  it('vale anche per le offerte nella scheda prodotto', () => {
    assert.ok(!/\s\/L$/.test(prezzoUnitario(offerta())));
  });

  it('senza confezione dichiarata non c’è prezzo unitario', () => {
    // Meglio niente che un numero calcolato su pezzi inventati.
    assert.equal(
      prezzoUnitarioDiCatalogo(prezzoDiCatalogo({ unitPrice: null, unitPriceBasis: null })),
      null,
    );
  });
});

describe('la confezione che accompagna il prezzo', () => {
  it('scioglie le sigle certe', () => {
    assert.equal(etichettaImballo('CT'), 'cartone');
    assert.equal(etichettaImballo('bt'), 'bottiglia');
  });

  it('lascia intatto quello che non conosce', () => {
    // Inventare uno scioglimento sbagliato è peggio di mostrare una sigla:
    // una sigla si riconosce come tale, una parola sbagliata no.
    assert.equal(etichettaImballo('XZ9'), 'XZ9');
    assert.equal(etichettaImballo(null), null);
  });

  it('dice imballo, formato e quanti pezzi', () => {
    assert.equal(confezioneDelPrezzo(prezzoDiCatalogo()), 'cartone · 50 cl × 24');
  });

  it('senza imballo resta il formato', () => {
    assert.equal(
      confezioneDelPrezzo(prezzoDiCatalogo({ packagingType: null, packQuantity: 1 })),
      '50 cl',
    );
  });
});

describe('il prezzo per unità contiene il rimborso concordato', () => {
  // Il caso vero: SUCCO AMITA PESCA CL.20X24, 4,8 L a confezione.
  //
  //   AD Beverage  15,52 € e rimborsa il 5% → 14,744 € → 3,0717 €/L
  //   Barzetti     14,88 € senza rimborso   → 14,880 € → 3,1000 €/L
  //
  // Sul listino il €/L dava vincente Barzetti (3,1000 contro 3,2333), mentre
  // il badge accanto diceva «AD Beverage più conveniente»: la stessa riga
  // affermava due cose opposte, e nessuna delle due spiegava l'altra.
  const conRimborso = offerta({
    scontoExtraApplicato: '5',
    price: {
      priceList: '15.52',
      discounts: [],
      priceNet: '15.52',
      unitPrice: '3.233333',
      unitPriceBasis: 'PER_L',
      validFrom: '2026-05-26',
    },
  });

  it('il €/L scende del rimborso', () => {
    assert.match(prezzoUnitario(conRimborso), /3,0717/);
  });

  it('e il costo reale della confezione si può mostrare accanto al netto', () => {
    assert.equal(costoRealeConfezione(conRimborso), '14.7440');
  });

  it('senza rimborso non cambia niente', () => {
    const senza = offerta({ scontoExtraApplicato: '0' });
    assert.equal(costoRealeConfezione(senza), null);
    assert.match(prezzoUnitario(senza), /0,4425/);
  });
});
