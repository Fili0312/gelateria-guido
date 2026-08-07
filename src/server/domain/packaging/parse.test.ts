import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analizzaDescrizione, analizzaFormato } from './parse';
import { CASI_FORMATO } from '../../../../tests/fixtures/formati';

/**
 * Il parser misurato sul vocabolario vero dei listini della gelateria.
 *
 * La soglia e' dichiarata: il criterio di completamento della Fase 2 chiede
 * il 95% dei casi raccolti, e i falliti devono essere elencati invece che
 * nascosti. Un parser che passa "quasi tutti" i test senza dire quali ha
 * mancato non e' misurato, e' solo verde.
 */

const SOGLIA = 0.95;

describe('analizzaFormato — vocabolario reale', () => {
  it(`riconosce almeno il ${Math.round(SOGLIA * 100)}% dei casi raccolti dai listini`, () => {
    const falliti: string[] = [];

    for (const caso of CASI_FORMATO) {
      const { formato, nucleo } = analizzaDescrizione(caso.testo, { unitaDiVendita: caso.um });
      const problemi: string[] = [];

      if (!formato.unitSize.equals(caso.atteso.unitSize)) {
        problemi.push(`formato ${formato.unitSize} invece di ${caso.atteso.unitSize}`);
      }
      if (formato.unitOfMeasure !== caso.atteso.uom) {
        problemi.push(`unita ${formato.unitOfMeasure} invece di ${caso.atteso.uom}`);
      }
      if (formato.packQuantity !== caso.atteso.packQuantity) {
        problemi.push(`confezione ${formato.packQuantity} invece di ${caso.atteso.packQuantity}`);
      }
      if (
        caso.atteso.packQuantityConfirmed !== undefined &&
        formato.packQuantityConfirmed !== caso.atteso.packQuantityConfirmed
      ) {
        problemi.push(
          `certezza ${formato.packQuantityConfirmed} invece di ${caso.atteso.packQuantityConfirmed}`,
        );
      }
      for (const parola of caso.nucleoContiene ?? []) {
        if (!nucleo.includes(parola)) problemi.push(`nucleo senza "${parola}": "${nucleo}"`);
      }
      for (const parola of caso.nucleoNonContiene ?? []) {
        if (nucleo.includes(parola)) problemi.push(`nucleo con "${parola}" di troppo: "${nucleo}"`);
      }

      if (problemi.length > 0) {
        falliti.push(`  [${caso.fonte}] ${caso.testo}\n      ${problemi.join('\n      ')}`);
      }
    }

    const passati = CASI_FORMATO.length - falliti.length;
    const quota = passati / CASI_FORMATO.length;
    const resoconto =
      `${passati}/${CASI_FORMATO.length} casi (${(quota * 100).toFixed(1)}%)` +
      (falliti.length > 0 ? `\nFalliti:\n${falliti.join('\n')}` : '');

    assert.ok(quota >= SOGLIA, resoconto);
  });
});

describe('analizzaFormato — casi che devono restare fermi', () => {
  it('1/1 e un litro, 1/10 un decimo', () => {
    assert.equal(analizzaFormato('AMARETTO 1/1').unitSize.toString(), '1');
    assert.equal(analizzaFormato('BITTER 1/10').unitSize.toString(), '0.1');
    assert.equal(analizzaFormato('RECOARO 1/5').unitSize.toString(), '0.2');
  });

  it('0.700 sono settanta centilitri, non settecento millilitri scritti male', () => {
    const f = analizzaFormato('BRAULIO 0.700');
    assert.equal(f.unitSize.toString(), '0.7');
    assert.equal(f.unitOfMeasure, 'L');
  });

  it('non scambia una data per un formato', () => {
    const f = analizzaFormato('LISTINO DEL 28/02/2025');
    assert.equal(f.unitOfMeasure, 'PIECE');
    assert.equal(f.unitSize.toString(), '1');
  });

  it('non scambia i gradi alcolici per un formato', () => {
    const f = analizzaFormato('VODKA 40% GRAN RISERVA');
    assert.equal(f.unitOfMeasure, 'PIECE');
  });

  it('non scambia una annata per un formato', () => {
    const f = analizzaFormato('BRANDY DIVINO 2006');
    assert.equal(f.unitOfMeasure, 'PIECE');
    assert.equal(f.packQuantity, 1);
  });

  it('rifiuta formati implausibili', () => {
    // Cinquecento litri in bottiglia non esistono: meglio nessun formato.
    const f = analizzaFormato('CODICE 500 LT ARTICOLO');
    assert.equal(f.unitOfMeasure, 'PIECE');
  });

  it('i pezzi sono confezione, non formato', () => {
    const f = analizzaFormato('Palettine conf. 1000 pz');
    assert.equal(f.packQuantity, 1000);
    assert.equal(f.unitOfMeasure, 'PIECE');
    assert.equal(f.unitSize.toString(), '1');
  });
});

describe('certezza della confezione', () => {
  it('a pezzo singolo (BT/UN/PZ) il numero 1 e un dato', () => {
    const f = analizzaFormato('GRAPPA CL.70', { unitaDiVendita: 'UN' });
    assert.equal(f.packQuantity, 1);
    assert.equal(f.packQuantityConfirmed, true);
  });

  it('a collo senza pezzi dichiarati il numero 1 e un ripiego', () => {
    const f = analizzaFormato('ALISEA NATURALE CL.50 PET', { unitaDiVendita: 'CO' });
    assert.equal(f.packQuantity, 1);
    assert.equal(
      f.packQuantityConfirmed,
      false,
      'senza questa distinzione il prezzo al litro sarebbe calcolato su un numero inventato',
    );
  });

  it('a collo con i pezzi dichiarati la confezione e certa', () => {
    const f = analizzaFormato('ALISEA GASSATA CL.50 PET X24', { unitaDiVendita: 'CO' });
    assert.equal(f.packQuantity, 24);
    assert.equal(f.packQuantityConfirmed, true);
  });
});

describe('nucleo della descrizione', () => {
  it('i tre modi di scrivere la stessa birra danno lo stesso nucleo', () => {
    const a = analizzaDescrizione('Birra XYZ 33cl x12');
    const b = analizzaDescrizione('XYZ Birra cl.33 conf. 12pz');
    const c = analizzaDescrizione('Birra XYZ bottiglia 0,33L 12 pezzi');

    for (const x of [a, b, c]) {
      assert.equal(x.formato.packQuantity, 12);
      assert.equal(x.formato.contentPerPack.toFixed(2), '3.96');
    }

    const parole = (n: string) => new Set(n.split(' ').filter((p) => p === 'birra' || p === 'xyz'));
    assert.deepEqual(parole(a.nucleo), parole(b.nucleo));
    assert.deepEqual(parole(a.nucleo), parole(c.nucleo));
  });
});
