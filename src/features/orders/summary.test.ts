import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { haSegnalazioniRiepilogo, selezionaRigheSenzaConfronto } from './summary';

describe('righe senza confronto nel riepilogo ordine', () => {
  const righe = [
    { id: 'gia-migliore', productId: 'p-confrontato' },
    { id: 'unica', productId: 'p-unico' },
    { id: 'non-riconciliata', productId: null },
  ];

  it('non confonde l’assenza di un’offerta migliore con l’assenza di confronto', () => {
    const selezionate = selezionaRigheSenzaConfronto(
      righe,
      new Map([
        ['p-confrontato', 2],
        ['p-unico', 1],
      ]),
    );

    assert.deepEqual(
      selezionate.map((riga) => riga.id),
      ['unica', 'non-riconciliata'],
    );
  });

  it('considera senza confronto anche un prodotto senza esito disponibile', () => {
    assert.deepEqual(
      selezionaRigheSenzaConfronto([{ id: 'mancante', productId: 'p-mancante' }], new Map()),
      [{ id: 'mancante', productId: 'p-mancante' }],
    );
  });
});

describe('visibilità del box segnalazioni', () => {
  it('resta visibile quando “senza confronto” è l’unica segnalazione', () => {
    assert.equal(
      haSegnalazioniRiepilogo({
        minimiNonRaggiunti: [],
        prezziCambiati: [],
        prezziFermi: [],
        senzaConfronto: [{ rigaId: 'riga-1' }],
      }),
      true,
    );
  });

  it('resta nascosto quando non c’è nessuna segnalazione', () => {
    assert.equal(
      haSegnalazioniRiepilogo({
        minimiNonRaggiunti: [],
        prezziCambiati: [],
        prezziFermi: [],
        senzaConfronto: [],
      }),
      false,
    );
  });
});
