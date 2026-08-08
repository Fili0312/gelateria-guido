import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { creaMock } from './mock';
import { AiError, estraiJson, leggiRisposta } from './provider';
import { rispostaProfiloSchema, rispostaRigheSchema, utenteProfilo } from './prompts';

describe('estraiJson — i modelli incorniciano volentieri', () => {
  it('legge il JSON nudo', () => {
    assert.deepEqual(estraiJson('{"a":1}'), { a: 1 });
  });

  it('toglie la cornice markdown', () => {
    assert.deepEqual(estraiJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(estraiJson('```\n{"a":1}\n```'), { a: 1 });
  });

  it('trova l’oggetto anche in mezzo a una frase di cortesia', () => {
    assert.deepEqual(estraiJson('Ecco il risultato:\n{"a":1}\nSpero sia utile.'), { a: 1 });
  });

  it('quando JSON non ce n’è, lo dice invece di restituire niente', () => {
    assert.throws(() => estraiJson('Mi dispiace, non ho capito.'), AiError);
    assert.throws(() => estraiJson('{ rotto'), AiError);
  });
});

describe('leggiRisposta — quello che dice il modello non entra senza controllo', () => {
  const schema = z.object({ n: z.number() });

  it('accetta la risposta giusta', () => {
    assert.deepEqual(leggiRisposta('{"n":3}', schema), { n: 3 });
  });

  it('rifiuta la risposta della forma sbagliata, dicendo quale campo', () => {
    assert.throws(() => leggiRisposta('{"n":"tre"}', schema), /n /);
  });
});

describe('lo schema del profilo', () => {
  it('accetta una risposta completa', () => {
    const r = rispostaProfiloSchema.parse({
      codice: 0,
      descrizione: 1,
      quantita: 2,
      unitaDiVendita: 3,
      prezzoListino: 4,
      sconti: [5, 6],
      prezzoNetto: 7,
      iva: 8,
    });
    assert.deepEqual(r.sconti, [5, 6]);
  });

  it('tollera una chiave in più ma non un indice assurdo', () => {
    // Tolleranza e credulità sono due cose diverse: una chiave sconosciuta si
    // ignora, un indice di colonna 900 no.
    assert.doesNotThrow(() => rispostaProfiloSchema.parse({ codice: 0, note: 'ciao' }));
    assert.throws(() => rispostaProfiloSchema.parse({ codice: 900 }));
    assert.throws(() => rispostaProfiloSchema.parse({ codice: -1 }));
  });

  it('i campi mancanti diventano null, non undefined', () => {
    const r = rispostaProfiloSchema.parse({});
    assert.equal(r.prezzoNetto, null);
    assert.deepEqual(r.sconti, []);
  });
});

describe('lo schema delle righe', () => {
  it('rifiuta uno sconto impossibile', () => {
    assert.throws(() =>
      rispostaRigheSchema.parse({ righe: [{ indice: 0, sconti: [150] }] }),
    );
  });

  it('limita quante righe può restituire in un colpo', () => {
    const troppe = Array.from({ length: 60 }, (_, i) => ({ indice: i }));
    assert.throws(() => rispostaRigheSchema.parse({ righe: troppe }));
  });
});

describe('il prompt del profilo', () => {
  const righe = [
    { celle: [{ testo: '20561', colonna: 0 }, { testo: 'ALISEA CL.50', colonna: 1 }] },
    { celle: [{ testo: '7A0757', colonna: 0 }, { testo: 'VODKA LT.1', colonna: 1 }] },
  ];

  it('mostra le celle con il loro indice di colonna', () => {
    const testo = utenteProfilo(righe);
    assert.match(testo, /\[0\] 20561/);
    assert.match(testo, /\[1\] ALISEA CL\.50/);
  });

  it('non manda al modello più righe di quante servano a capire', () => {
    // Il campione serve a riconoscere le colonne, non a leggere il listino:
    // mandarlo intero costerebbe cento volte tanto per la stessa risposta.
    const molte = Array.from({ length: 200 }, (_, i) => ({
      celle: [{ testo: `COD${i}`, colonna: 0 }],
    }));
    const testo = utenteProfilo(molte);
    assert.match(testo, /Riga 12:/);
    assert.doesNotMatch(testo, /Riga 13:/);
  });
});

describe('il provider finto', () => {
  it('gira senza rete e conta comunque i token', () => {
    // Se in modalità finta i contatori restassero a zero, il codice del
    // budget non verrebbe mai esercitato dai test.
    const mock = creaMock(() => '{"codice":0}');
    return mock
      .chiedi({ sistema: 'S', utente: 'U'.repeat(40), versionePrompt: 'v1' })
      .then((r) => {
        assert.equal(r.testo, '{"codice":0}');
        assert.ok(r.tokenIngresso > 0);
        assert.ok(r.tokenUscita > 0);
        assert.equal(r.costoUsd, 0);
      });
  });

  it('è deterministico: due chiamate uguali danno la stessa risposta', () => {
    const mock = creaMock((r) => JSON.stringify({ lunghezza: r.utente.length }));
    return Promise.all([
      mock.chiedi({ sistema: 'S', utente: 'abc', versionePrompt: 'v1' }),
      mock.chiedi({ sistema: 'S', utente: 'abc', versionePrompt: 'v1' }),
    ]).then(([a, b]) => assert.equal(a.testo, b.testo));
  });
});
