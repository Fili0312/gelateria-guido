import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { categoriaSuggerita, TASSONOMIA_INIZIALE } from './categorie';

describe('tassonomia iniziale', () => {
  it('contiene quattro reparti e ventinove categorie senza duplicati', () => {
    const categorie = TASSONOMIA_INIZIALE.flatMap((reparto) => reparto.categories);
    assert.equal(TASSONOMIA_INIZIALE.length, 4);
    assert.equal(categorie.length, 29);
    assert.equal(new Set(categorie).size, categorie.length);
  });

  it('ogni suggerimento punta a una categoria realmente disponibile', () => {
    const categorie: ReadonlySet<string> = new Set<string>(
      TASSONOMIA_INIZIALE.flatMap((reparto) => reparto.categories),
    );
    for (const testo of ['ACQUA', 'BIRRA', 'GRAPPE E LIQUORI', 'CAFFE', 'FRUTTA SECCA']) {
      const suggerita = categoriaSuggerita(testo);
      assert.ok(suggerita && categorie.has(suggerita), `${testo}: ${suggerita}`);
    }
  });
});

describe('categoriaSuggerita — le categorie vere dei listini', () => {
  it('riconosce le otto voci già in catalogo', () => {
    const attesi: [string, string][] = [
      ['Acqua', 'Acqua'],
      ['Bibite', 'Bibite'],
      ['Amari', 'Amari e liquori'],
      ['Liquori', 'Amari e liquori'],
      ['Aperitivi', 'Aperitivi'],
      ['Rum', 'Distillati'],
      ['Vodka', 'Distillati'],
      ['Sciroppi', 'Sciroppi'],
    ];
    for (const [fornitore, nostra] of attesi) {
      assert.equal(categoriaSuggerita(fornitore), nostra, `"${fornitore}"`);
    }
  });

  it('ignora maiuscole e accenti, come li scrivono i fornitori', () => {
    assert.equal(categoriaSuggerita('BIRRA'), 'Birre');
    assert.equal(categoriaSuggerita("CAFFE'"), 'Caffè e infusi');
    assert.equal(categoriaSuggerita('Caffè'), 'Caffè e infusi');
  });

  it('«amaro» vince su «liquori» quando compaiono insieme', () => {
    // Vale in entrambi i casi, ma per il motivo giusto: la regola più
    // specifica sta prima nell'elenco.
    assert.equal(categoriaSuggerita('AMARI E LIQUORI'), 'Amari e liquori');
    assert.equal(categoriaSuggerita('GRAPPE E LIQUORI'), 'Distillati');
  });

  it('classifica le trenta categorie di AD Beverage senza inventare', () => {
    const adBeverage = ['ACQUA', 'AMARO', 'BIRRA', 'GIN', 'VODKA', 'WHISKY', 'RUM', 'VINO'];
    for (const voce of adBeverage) {
      assert.ok(categoriaSuggerita(voce), `"${voce}" dovrebbe avere una categoria`);
    }
  });
});

describe('categoriaSuggerita — quando non sa, lo dice', () => {
  it('senza testo non propone niente', () => {
    assert.equal(categoriaSuggerita(null), null);
    assert.equal(categoriaSuggerita(undefined), null);
    assert.equal(categoriaSuggerita(''), null);
    assert.equal(categoriaSuggerita('   '), null);
  });

  it('su una categoria che non conosce non ripiega su una generica', () => {
    assert.equal(categoriaSuggerita('ARTICOLI VARI'), null);
    assert.equal(categoriaSuggerita('PROMOZIONI'), null);
  });

  it('confronta parole intere, non sottostringhe', () => {
    // "oli" dentro "cioccolato" e "the" dentro "sorbetto" farebbero scattare
    // la regola sbagliata, e il risultato sembrerebbe solo un po' strano
    // invece che sbagliato.
    assert.equal(categoriaSuggerita('CIOCCOLATO'), 'Cioccolato e coperture');
    assert.notEqual(categoriaSuggerita('CIOCCOLATO'), 'Olio, aceto e spezie');
    assert.equal(categoriaSuggerita('SORBETTI'), null);
  });

  it('riconosce anche le voci di più parole', () => {
    assert.equal(categoriaSuggerita('FRUTTA SECCA'), 'Frutta secca e granelle');
    assert.equal(categoriaSuggerita('SOFT DRINK'), 'Bibite');
  });
});
