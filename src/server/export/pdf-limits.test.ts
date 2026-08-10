import assert from 'node:assert/strict';
import { describe, it, test } from 'node:test';
import {
  entroTempo,
  LimiteConcorrente,
  MAX_DOCUMENTI_PER_GENERAZIONE,
  numeroDocumentiConsentito,
  OperazioneScadutaError,
} from './pdf-limits';

describe('limite concorrente Chromium', () => {
  it('non ammette più lavori del limite e recupera lo slot al rilascio', () => {
    const limite = new LimiteConcorrente(2);
    const rilasciaA = limite.provaAcquisire();
    const rilasciaB = limite.provaAcquisire();
    assert.ok(rilasciaA);
    assert.ok(rilasciaB);
    assert.equal(limite.provaAcquisire(), null);

    rilasciaA();
    assert.ok(limite.provaAcquisire());
    // Il rilascio è idempotente: una `finally` duplicata non crea slot falsi.
    rilasciaA();
  });
});

describe('timeout esplicito', () => {
  it('interrompe con un errore riconoscibile e chiama la pulizia', async () => {
    let pulito = false;
    await assert.rejects(
      entroTempo(new Promise<void>(() => {}), 5, () => {
        pulito = true;
      }),
      OperazioneScadutaError,
    );
    assert.equal(pulito, true);
  });

  it('lascia passare un lavoro concluso in tempo', async () => {
    assert.equal(await entroTempo(Promise.resolve('ok'), 100), 'ok');
  });

  it('non aspetta una pulizia che non termina', async () => {
    const iniziato = Date.now();
    await assert.rejects(
      entroTempo(new Promise<void>(() => {}), 5, () => new Promise<void>(() => {})),
      OperazioneScadutaError,
    );
    assert.ok(Date.now() - iniziato < 500, 'il timeout deve restare indipendente dalla pulizia');
  });
});

test('una singola richiesta non può espandersi in documenti illimitati', () => {
  assert.equal(numeroDocumentiConsentito(1), true);
  assert.equal(numeroDocumentiConsentito(MAX_DOCUMENTI_PER_GENERAZIONE), true);
  assert.equal(numeroDocumentiConsentito(MAX_DOCUMENTI_PER_GENERAZIONE + 1), false);
});
