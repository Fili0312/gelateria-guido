import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CAMPI_IMPOSTAZIONI,
  SETTINGS_ALL_KEYS,
  SETTINGS_DEFAULTS,
  SETTINGS_KEYS,
  settingsFormSchema,
  valoriDaRighe,
} from './schema';

test('ogni impostazione ha una chiave, un predefinito e un campo nel form', () => {
  const campi = Object.keys(SETTINGS_DEFAULTS);
  assert.deepEqual(Object.keys(SETTINGS_KEYS).sort(), campi.slice().sort());
  assert.deepEqual([...CAMPI_IMPOSTAZIONI].sort(), campi.slice().sort());
  assert.equal(SETTINGS_ALL_KEYS.length, campi.length);
  // Due impostazioni sulla stessa chiave si sovrascriverebbero a vicenda.
  assert.equal(new Set(SETTINGS_ALL_KEYS).size, SETTINGS_ALL_KEYS.length);
});

test('il tipo lo detta il predefinito: un numero dove va testo si ignora', () => {
  const valori = valoriDaRighe([
    { key: SETTINGS_KEYS.defaultVat, value: 10 },
    { key: SETTINGS_KEYS.intestazioneNome, value: 'Gelateria Guido' },
    // Roba scritta male in una tabella libera: si ripiega sul predefinito
    // invece di far fallire la pagina.
    { key: SETTINGS_KEYS.intestazionePiva, value: 12345 },
    { key: SETTINGS_KEYS.alertEuro, value: 'tanti' },
    { key: 'chiave.che.non.esiste', value: 'x' },
  ]);
  assert.equal(valori.defaultVat, 10);
  assert.equal(valori.intestazioneNome, 'Gelateria Guido');
  assert.equal(valori.intestazionePiva, SETTINGS_DEFAULTS.intestazionePiva);
  assert.equal(valori.alertEuro, SETTINGS_DEFAULTS.alertEuro);
});

test('i campi dell’intestazione si ripuliscono, e vuoto resta vuoto', () => {
  const esito = settingsFormSchema.safeParse({
    ...SETTINGS_DEFAULTS,
    intestazioneNome: '  Gelateria   Guido  ',
    // Un indirizzo su due righe è la cosa più naturale da scrivere, e in un
    // header HTTP un a capo rompe la risposta.
    intestazioneIndirizzo: 'Via Roma 1\nCivitanova',
    intestazionePiva: '',
  });
  assert.ok(esito.success, JSON.stringify(esito.error?.issues));
  assert.equal(esito.data.intestazioneNome, 'Gelateria Guido');
  assert.equal(esito.data.intestazioneIndirizzo, 'Via Roma 1 Civitanova');
  assert.equal(esito.data.intestazionePiva, '');
});

test('un file «use server» esporta solo funzioni asincrone', () => {
  // Next lo verifica **a runtime**: un array esportato da un modulo
  // `'use server'` compila, passa il build, e poi dà 500 al primo
  // salvataggio. È successo con l'elenco dei campi delle impostazioni, e ha
  // rotto il salvataggio di tutte, non solo di quelle nuove.
  const file = globSync('src/**/*.ts', { cwd: process.cwd() }).filter((percorso) => {
    const testo = readFileSync(percorso, 'utf8');
    return /^\s*['"]use server['"]/.test(testo);
  });
  assert.ok(
    file.length > 0,
    'nessun file «use server» trovato: il controllo non sta provando niente',
  );

  for (const percorso of file) {
    const testo = readFileSync(percorso, 'utf8');
    for (const riga of testo.split('\n')) {
      const esportazione = /^export\s+(?!async\s+function|type\b|interface\b|\{)(\S+)/.exec(riga);
      assert.equal(
        esportazione,
        null,
        `${percorso}: «${riga.trim()}» — un file «use server» può esportare solo funzioni asincrone`,
      );
    }
  }
});
