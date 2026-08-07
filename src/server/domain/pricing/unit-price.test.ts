import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analizzaFormato } from '../packaging/parse';
import {
  confezioniEquivalenti,
  confrontaOfferte,
  prezzoPerPezzo,
  prezzoPerUnita,
} from './unit-price';

describe('prezzoPerUnita — il caso del punto 5 della specifica', () => {
  it('12 bottiglie a 9 euro contro 24 a 16: vince il secondo', () => {
    // La domanda della specifica: non basta confrontare 9 con 16.
    const dodici = analizzaFormato('Birra XYZ 33cl x12');
    const ventiquattro = analizzaFormato('Birra XYZ 33cl x24');

    assert.equal(dodici.contentPerPack.toFixed(2), '3.96');
    assert.equal(ventiquattro.contentPerPack.toFixed(2), '7.92');

    const a = prezzoPerUnita('9.00', dodici.contentPerPack, dodici.baseUnit);
    const b = prezzoPerUnita('16.00', ventiquattro.contentPerPack, ventiquattro.baseUnit);

    assert.equal(a.valore.toFixed(4), '2.2727'); // euro al litro
    assert.equal(b.valore.toFixed(4), '2.0202');
    assert.equal(a.basis, 'PER_L');

    assert.ok(b.valore.lt(a.valore), 'il collo da 24 conviene, anche se costa di piu');

    // Quanto conviene, in percentuale: e' il numero che va mostrato.
    const risparmio = a.valore.minus(b.valore).div(a.valore).mul(100);
    assert.equal(risparmio.toFixed(1), '11.1');
  });

  it('prezzo al pezzo per lo stesso caso', () => {
    assert.equal(prezzoPerPezzo('9.00', 12).toFixed(4), '0.7500');
    assert.equal(prezzoPerPezzo('16.00', 24).toFixed(4), '0.6667');
  });

  it('funziona a peso come a volume', () => {
    const nocciola = analizzaFormato('Pasta Nocciola secchiello 5 kg');
    const p = prezzoPerUnita('62.50', nocciola.contentPerPack, nocciola.baseUnit);
    assert.equal(p.valore.toFixed(2), '12.50');
    assert.equal(p.basis, 'PER_KG');
  });

  it('rifiuta di dividere per zero invece di inventare un numero', () => {
    assert.throws(() => prezzoPerUnita('10', '0', 'L'), /non si puo calcolare/);
  });
});

describe('confrontaOfferte', () => {
  const offerta = (id: string, prezzo: string, testo: string, certa = true) => {
    const f = analizzaFormato(testo);
    return {
      id,
      prezzoNetto: prezzo,
      contenutoPerConfezione: f.contentPerPack,
      base: f.baseUnit,
      confezioneCerta: certa,
    };
  };

  it('ordina per prezzo unitario, non per prezzo di listino', () => {
    const esito = confrontaOfferte([
      offerta('A', '9.00', 'Birra XYZ 33cl x12'),
      offerta('B', '16.00', 'Birra XYZ 33cl x24'),
      offerta('C', '11.00', 'Birra XYZ 33cl x12'),
    ]);
    assert.equal(esito.confrontabile, true);
    assert.equal(esito.migliore?.id, 'B');
    assert.deepEqual(
      esito.classifica.map((c) => c.id),
      ['B', 'A', 'C'],
    );
  });

  it('si rifiuta di confrontare chili con litri', () => {
    const esito = confrontaOfferte([
      offerta('A', '10.00', 'Sciroppo LT.1'),
      offerta('B', '10.00', 'Sciroppo KG 1'),
    ]);
    assert.equal(esito.confrontabile, false);
    assert.equal(esito.migliore, null, 'meglio nessun confronto che un confronto falso');
  });

  it('esclude le offerte con la confezione ignota, e lo dichiara', () => {
    const esito = confrontaOfferte([
      offerta('A', '9.00', 'Birra XYZ 33cl x12'),
      offerta('IGNOTA', '5.25', 'Alisea CL.50 PET', false),
    ]);
    assert.equal(esito.migliore?.id, 'A');
    assert.deepEqual(esito.escluse, ['IGNOTA']);
  });

  it('senza offerte valide non inventa un vincitore', () => {
    const esito = confrontaOfferte([offerta('X', '5.00', 'Alisea CL.50', false)]);
    assert.equal(esito.migliore, null);
    assert.deepEqual(esito.escluse, ['X']);
  });
});

describe('confezioniEquivalenti — il cambio di fornitore della Fase 13', () => {
  it('4 confezioni da 12 diventano 2 da 24, a parita di pezzi', () => {
    const dodici = analizzaFormato('Birra 33cl x12');
    const ventiquattro = analizzaFormato('Birra 33cl x24');
    const esito = confezioniEquivalenti(4, dodici.contentPerPack, ventiquattro.contentPerPack);
    assert.equal(esito.confezioni, 2);
    assert.equal(esito.resto.toFixed(2), '0.00', 'nessun avanzo: 48 pezzi in entrambi i casi');
  });

  it('quando non torna esatto lo dice, invece di arrotondare in silenzio', () => {
    const dodici = analizzaFormato('Birra 33cl x12');
    const ventiquattro = analizzaFormato('Birra 33cl x24');
    const esito = confezioniEquivalenti(3, dodici.contentPerPack, ventiquattro.contentPerPack);
    assert.equal(esito.confezioni, 2);
    assert.ok(!esito.resto.isZero(), 'il resto va mostrato: si comprano 48 pezzi invece di 36');
  });
});
