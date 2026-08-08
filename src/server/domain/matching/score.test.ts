import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { describe, it } from 'node:test';
import { analizzaDescrizione } from '../packaging/parse';
import { decidiDaArbitrato, decidiDaPunteggio, SOGLIE_PREDEFINITE } from './decide';
import { formatiCompatibili, punteggioAbbinamento, sovrapposizioneParole } from './score';

/** Dal testo di un listino ai due dati che servono al confronto. */
function formatoDi(testo: string) {
  const { formato, nucleo } = analizzaDescrizione(testo);
  return {
    nucleo,
    formato: {
      unitSize: formato.unitSize,
      unitOfMeasure: formato.unitOfMeasure,
      baseUnit: formato.baseUnit,
    },
  };
}

describe('formatiCompatibili — il cancello', () => {
  it('33 cl e 33 cl sono lo stesso formato', () => {
    const a = formatoDi('Birra XYZ 33cl x12').formato;
    const b = formatoDi('XYZ Birra cl.33 conf. 12pz').formato;
    assert.equal(formatiCompatibili(a, b).compatibile, true);
  });

  it('33 cl e 66 cl NON lo sono, e il motivo si può mostrare', () => {
    const a = formatoDi('Birra XYZ 33cl').formato;
    const b = formatoDi('Birra XYZ 66cl').formato;
    const esito = formatiCompatibili(a, b);
    assert.equal(esito.compatibile, false);
    assert.match(esito.motivo!, /formati diversi/);
  });

  it('fra chili e litri non si converte mai', () => {
    // Servirebbe una densità che non abbiamo: il risultato sarebbe
    // plausibile e falso.
    const litri = { unitSize: new Decimal(1), unitOfMeasure: 'L' as const, baseUnit: 'L' as const };
    const chili = { unitSize: new Decimal(1), unitOfMeasure: 'KG' as const, baseUnit: 'KG' as const };
    const esito = formatiCompatibili(litri, chili);
    assert.equal(esito.compatibile, false);
    assert.match(esito.motivo!, /unità diverse/);
  });

  it('«33 cl» e «0,33 L» sono lo stesso formato scritto in due modi', () => {
    // Senza la conversione all'unità base, 33 verrebbe confrontato con 0,33 e
    // i due risulterebbero prodotti diversi.
    const a = formatoDi('Birra XYZ 33cl').formato;
    const b = formatoDi('Birra XYZ 0,33L').formato;
    assert.equal(formatiCompatibili(a, b).compatibile, true);
  });

  it('tollera l’arrotondamento fra 0,33 e 0,330', () => {
    const a = { unitSize: new Decimal('0.33'), unitOfMeasure: 'L' as const, baseUnit: 'L' as const };
    const b = { unitSize: new Decimal('0.330'), unitOfMeasure: 'L' as const, baseUnit: 'L' as const };
    assert.equal(formatiCompatibili(a, b).compatibile, true);
  });

  it('ma non tollera il 5%', () => {
    // 0,33 e 0,35 sono due bottiglie diverse, non un arrotondamento.
    const a = { unitSize: new Decimal('0.33'), unitOfMeasure: 'L' as const, baseUnit: 'L' as const };
    const b = { unitSize: new Decimal('0.35'), unitOfMeasure: 'L' as const, baseUnit: 'L' as const };
    assert.equal(formatiCompatibili(a, b).compatibile, false);
  });

  it('un formato ignoto non si abbina a nulla', () => {
    const noto = { unitSize: new Decimal('0.33'), unitOfMeasure: 'L' as const, baseUnit: 'L' as const };
    const ignoto = { unitSize: new Decimal(0), unitOfMeasure: 'L' as const, baseUnit: 'L' as const };
    assert.equal(formatiCompatibili(noto, ignoto).compatibile, false);
  });
});

describe('sovrapposizioneParole', () => {
  it('due descrizioni identiche danno 1', () => {
    assert.equal(sovrapposizioneParole('birra xyz', 'birra xyz'), 1);
  });

  it('distingue due birre diverse che i trigrammi confonderebbero', () => {
    // «birra moretti» e «birra peroni» condividono molti trigrammi ma una
    // parola su tre.
    const s = sovrapposizioneParole('birra moretti', 'birra peroni');
    assert.ok(s < 0.5, `${s} dovrebbe essere basso`);
  });

  it('l’ordine delle parole non conta', () => {
    assert.equal(sovrapposizioneParole('birra xyz', 'xyz birra'), 1);
  });
});

describe('punteggioAbbinamento', () => {
  it('formato incompatibile azzera il punteggio, qualunque sia il testo', () => {
    const a = formatoDi('Birra XYZ 33cl');
    const b = formatoDi('Birra XYZ 66cl');
    // Il testo è quasi identico: senza il cancello sul formato passerebbe.
    const p = punteggioAbbinamento(0.99, a.nucleo, b.nucleo, a.formato, b.formato);
    assert.equal(p.punteggio, 0);
    assert.equal(p.trigram, 0.99, 'la somiglianza testuale si vede comunque');
  });

  it('stesso formato: il punteggio combina trigrammi e parole', () => {
    const a = formatoDi('Birra XYZ 33cl x12');
    const b = formatoDi('XYZ Birra cl.33 conf. 12pz');
    const p = punteggioAbbinamento(0.95, a.nucleo, b.nucleo, a.formato, b.formato);
    assert.ok(p.punteggio > 0.9, `punteggio ${p.punteggio}`);
    assert.equal(p.formato.compatibile, true);
  });
});

describe('i tre modi di scrivere la stessa birra — il caso della specifica', () => {
  const testi = [
    'Birra XYZ 33cl x12',
    'XYZ Birra cl.33 conf. 12pz',
    'Birra XYZ bottiglia 0,33L 12 pezzi',
  ];

  it('hanno tutti lo stesso formato', () => {
    const formati = testi.map((t) => formatoDi(t).formato);
    assert.equal(formatiCompatibili(formati[0]!, formati[1]!).compatibile, true);
    assert.equal(formatiCompatibili(formati[0]!, formati[2]!).compatibile, true);
    assert.equal(formatiCompatibili(formati[1]!, formati[2]!).compatibile, true);
  });

  it('e si abbinano fra loro anche con una somiglianza testuale imperfetta', () => {
    const a = formatoDi(testi[0]!);
    for (const altro of testi.slice(1)) {
      const b = formatoDi(altro);
      const p = punteggioAbbinamento(0.9, a.nucleo, b.nucleo, a.formato, b.formato);
      const d = decidiDaPunteggio(p);
      assert.notEqual(d.esito, 'NUOVO', `${altro} non dovrebbe risultare un prodotto nuovo`);
    }
  });
});

describe('decidiDaPunteggio', () => {
  const punto = (trigram: number, parole = 1) => ({
    punteggio: Number((trigram * 0.65 + parole * 0.35).toFixed(3)),
    trigram,
    parole,
    formato: { compatibile: true, motivo: null },
  });

  it('sopra la soglia alta abbina da solo', () => {
    assert.equal(decidiDaPunteggio(punto(1)).esito, 'AUTO');
  });

  it('nella zona grigia propone e aspetta', () => {
    const d = decidiDaPunteggio(punto(0.7, 0.7));
    assert.equal(d.esito, 'PENDING');
    assert.match(d.motivo, /decide una persona/);
  });

  it('sotto la soglia minima crea un prodotto nuovo', () => {
    assert.equal(decidiDaPunteggio(punto(0.2, 0.2)).esito, 'NUOVO');
  });

  it('formato incompatibile: prodotto nuovo, e dice perché', () => {
    const d = decidiDaPunteggio({
      punteggio: 0,
      trigram: 0.99,
      parole: 1,
      formato: { compatibile: false, motivo: 'formati diversi: 0.33 contro 0.66 L' },
    });
    assert.equal(d.esito, 'NUOVO');
    assert.match(d.motivo, /due prodotti diversi/);
  });
});

describe('decidiDaArbitrato — l’IA non decide mai da sola', () => {
  it('con confidenza alta propone un AUTO, ma marcato come deciso dal modello', () => {
    const d = decidiDaArbitrato({ stesso: true, confidenza: 0.95 }, 0.8);
    assert.equal(d.esito, 'AUTO');
    assert.equal(d.metodo, 'LLM');
  });

  it('sotto la soglia di confidenza resta PENDING anche se dice «sì»', () => {
    const d = decidiDaArbitrato({ stesso: true, confidenza: 0.8 }, 0.8);
    assert.equal(d.esito, 'PENDING');
    assert.match(d.motivo, /sotto la soglia/);
  });

  it('un «sono diversi» non crea un prodotto nuovo da solo', () => {
    // Sbagliare un «sono diversi» è meno visibile che sbagliare un «sono
    // uguali», ma produce due duplicati che nessuno noterà mai.
    const d = decidiDaArbitrato({ stesso: false, confidenza: 0.99 }, 0.8);
    assert.equal(d.esito, 'PENDING');
  });

  it('una confidenza assurda non fa scattare niente', () => {
    for (const confidenza of [NaN, -1, 42]) {
      const d = decidiDaArbitrato({ stesso: true, confidenza }, 0.8);
      if (confidenza === 42) {
        // Viene ricondotta a 1: un modello che risponde 42 non è più sicuro
        // di uno che risponde 1.
        assert.equal(d.esito, 'AUTO');
      } else {
        assert.equal(d.esito, 'PENDING', String(confidenza));
      }
    }
  });

  it('la soglia si può alzare senza toccare il codice', () => {
    const severe = { ...SOGLIE_PREDEFINITE, confidenzaIa: 0.99 };
    assert.equal(decidiDaArbitrato({ stesso: true, confidenza: 0.9 }, 0.8, severe).esito, 'PENDING');
  });
});
