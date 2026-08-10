import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { improntaDaCampi, improntaDaDescrizione } from './fingerprint';

/**
 * L'impronta e' l'identita' di ripiego quando il fornitore non da' un
 * codice, e la chiave con cui si riconcilia un import col precedente.
 * Deve essere uguale quando il prodotto e' lo stesso scritto in modo
 * diverso, e diversa appena cambia qualcosa che conta.
 */

describe('improntaDaDescrizione', () => {
  it('e la stessa per lo stesso prodotto scritto in tre modi', () => {
    const a = improntaDaDescrizione('Birra XYZ 33cl x12');
    const b = improntaDaDescrizione('XYZ Birra cl.33 x12');
    const c = improntaDaDescrizione('Birra XYZ 0,33L x12');
    assert.equal(a, b);
    assert.equal(a, c);
  });

  it('cambia se cambia il formato', () => {
    assert.notEqual(
      improntaDaDescrizione('Birra XYZ 33cl x12'),
      improntaDaDescrizione('Birra XYZ 66cl x12'),
      '33 cl e 66 cl non sono lo stesso prodotto, per quanto si somiglino',
    );
  });

  it('cambia se cambia la confezione', () => {
    assert.notEqual(
      improntaDaDescrizione('Birra XYZ 33cl x12'),
      improntaDaDescrizione('Birra XYZ 33cl x24'),
      'e cio che fa finire in revisione un cambio di confezione invece che in un falso crollo di prezzo',
    );
  });

  it('cambia se cambia il prodotto', () => {
    assert.notEqual(
      improntaDaDescrizione('Birra XYZ 33cl x12'),
      improntaDaDescrizione('Birra ABC 33cl x12'),
    );
  });

  it('non cambia per maiuscole, accenti o ordine delle parole', () => {
    assert.equal(
      improntaDaDescrizione('CAFFE MOKA VARNELLI 1/1'),
      improntaDaDescrizione('varnelli caffè moka 1/1'),
    );
  });

  it('e stabile: la stessa descrizione da sempre la stessa impronta', () => {
    const uno = improntaDaDescrizione('ALISEA NATURALE CL.50 PET');
    const due = improntaDaDescrizione('ALISEA NATURALE CL.50 PET');
    assert.equal(uno, due);
    assert.match(uno, /^[0-9a-f]{32}$/);
  });
});

describe('improntaDaCampi', () => {
  it('usa formato e pezzi delle colonne anche quando non sono nella descrizione', () => {
    const dodici = improntaDaCampi({
      descrizione: 'BIRRA XYZ',
      unitSize: '33',
      unitOfMeasure: 'CL',
      packQuantity: 12,
    });
    const ventiquattro = improntaDaCampi({
      descrizione: 'BIRRA XYZ',
      unitSize: '33',
      unitOfMeasure: 'CL',
      packQuantity: 24,
    });
    assert.notEqual(dodici, ventiquattro);
    assert.equal(dodici, improntaDaDescrizione('BIRRA XYZ 33cl x12'));
  });
});
