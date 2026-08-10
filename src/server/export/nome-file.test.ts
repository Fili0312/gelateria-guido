import assert from 'node:assert/strict';
import test from 'node:test';
import { contentDisposition, giorno, nomeFile, pezzoDiNome } from './nome-file';

test('gli accenti e i simboli spariscono dal nome del file', () => {
  assert.equal(pezzoDiNome('Caffè Molinari S.r.l.'), 'caffe-molinari-s-r-l');
  assert.equal(pezzoDiNome('Dolci & Più'), 'dolci-piu');
  // Una barra dentro il nome del fornitore creerebbe una cartella.
  assert.equal(pezzoDiNome('A/B'), 'a-b');
  assert.equal(pezzoDiNome('../../etc/passwd'), 'etc-passwd');
});

test('un nome fatto di soli simboli non lascia il campo vuoto', () => {
  assert.equal(pezzoDiNome('***'), 'senza-nome');
  assert.equal(pezzoDiNome(''), 'senza-nome');
});

test('la data viene prima, così ordinando per nome si ordina per data', () => {
  const a = nomeFile({
    data: new Date(2026, 7, 9),
    codice: '2026-0002',
    qualifica: 'Cecconi',
    estensione: 'pdf',
  });
  const b = nomeFile({
    data: new Date(2026, 7, 10),
    codice: '2026-0003',
    qualifica: 'Barzelli',
    estensione: 'pdf',
  });
  assert.equal(a, '2026-08-09_ordine-2026-0002_cecconi.pdf');
  // Barzelli viene dopo Cecconi in ordine alfabetico, ma il giorno dopo:
  // se l'ordinamento fosse per fornitore questo confronto fallirebbe.
  assert.ok(a < b, `${a} deve venire prima di ${b}`);
});

test('il nome contiene fornitore e numero d’ordine', () => {
  const n = nomeFile({
    data: new Date(2026, 0, 3),
    codice: '2026-0042',
    qualifica: 'Cecconi',
    estensione: 'pdf',
  });
  assert.ok(n.includes('cecconi'), n);
  assert.ok(n.includes('2026-0042'), n);
});

test('il giorno usa l’ora locale, non UTC', () => {
  // Alle 23:30 del 10 agosto in Italia, UTC è ancora il 10 — ma alle 00:30
  // dell'11 UTC è ancora il 10, e il file finirebbe datato il giorno prima.
  assert.equal(giorno(new Date(2026, 7, 11, 0, 30)), '2026-08-11');
});

test('una virgoletta nel nome non rompe l’header', () => {
  const header = contentDisposition('ordine "strano".pdf');
  assert.ok(!header.includes('"ordine "strano".pdf"'));
  assert.ok(header.includes("filename*=UTF-8''"));
});
