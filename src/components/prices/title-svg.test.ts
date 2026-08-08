import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * `<title>` deve avere un figlio solo.
 *
 * React 19 tratta `<title>` come metadato del documento. Con piu' di un figlio
 * — testo fisso piu' un'espressione — il render sul server lo emette **vuoto**:
 * il nome accessibile sparisce dall'HTML e l'idratazione fallisce, buttando via
 * e ridisegnando l'intero sottoalbero sul client.
 *
 * E' successo davvero, nel grafico dello storico prezzi, e dai test unitari non
 * si vedeva: la funzione che costruisce la serie era corretta, il guasto stava
 * nella serializzazione. Questo controllo guarda quindi il sorgente, che e'
 * dove il problema e' visibile, invece di provare a simulare il render.
 *
 * La regola pratica: comporre la stringa **prima**, e passarla come unico
 * figlio.
 */

const RADICE = new URL('../..', import.meta.url).pathname;

function sorgenti(cartella: string): string[] {
  const trovati: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      trovati.push(...sorgenti(percorso));
    } else if (percorso.endsWith('.tsx')) {
      trovati.push(percorso);
    }
  }
  return trovati;
}

describe('<title> nei componenti', () => {
  it('non mescola mai testo ed espressioni', () => {
    const colpevoli: string[] = [];

    for (const file of sorgenti(RADICE)) {
      // I commenti si tolgono prima: questa stessa regola è spiegata a parole
      // dentro un commento del grafico, e senza la ripulitura il controllo
      // segnalerebbe la propria documentazione.
      const contenuto = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const corpo of contenuto.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/g)) {
        const dentro = corpo[1]!.trim();
        // Un figlio solo: o tutta espressione `{...}`, o tutto testo.
        const tuttaEspressione = /^\{[\s\S]*\}$/.test(dentro) && !/\}[^{]*\{/.test(dentro);
        const tuttoTesto = !dentro.includes('{');
        if (!tuttaEspressione && !tuttoTesto) {
          colpevoli.push(`${file.replace(RADICE, 'src/')}: <title>${dentro}</title>`);
        }
      }
    }

    assert.deepEqual(
      colpevoli,
      [],
      'Componi la stringa prima e passala come figlio unico:\n' + colpevoli.join('\n'),
    );
  });

  it('il controllo sa riconoscere il caso rotto', () => {
    // Senza questa verifica il test sopra passerebbe anche se la regex non
    // trovasse mai niente, ed essere verdi per il motivo sbagliato e' peggio
    // che essere rossi.
    const rotto = '<title id={titleId}>Storico del prezzo netto di {supplierName}</title>';
    const dentro = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(rotto)![1]!.trim();
    assert.equal(/^\{[\s\S]*\}$/.test(dentro) && !/\}[^{]*\{/.test(dentro), false);
    assert.equal(dentro.includes('{'), true);
  });
});
