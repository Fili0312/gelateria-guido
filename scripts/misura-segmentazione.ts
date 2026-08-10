import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { leggiBbox } from '../src/server/import/pdf/bbox.js';
import { segmenta } from '../src/server/import/pdf/segment.js';

/**
 * Misura la copertura del segmentatore sui listini veri.
 *
 * Il criterio della Fase 7 chiede il 90% di righe prodotto individuate su
 * ciascun PDF, contate a mano. I conteggi di riferimento stanno in
 * `tests/fixtures/listini/atteso.json` e sono stati ricavati a mano dal testo
 * dei documenti, non da questo codice: farli produrre al programma che si
 * vuole misurare non misurerebbe niente.
 *
 *   pnpm exec tsx scripts/misura-segmentazione.ts [--righe]
 */

const CARTELLA = join(import.meta.dirname, '..', 'tests', 'fixtures', 'listini');
const mostraRighe = process.argv.includes('--righe');

interface Atteso {
  [file: string]: { prodotti: number; nota: string };
}

const atteso: Atteso = JSON.parse(
  execFileSync('cat', [join(CARTELLA, 'atteso.json')], { encoding: 'utf8' }),
);

const SOGLIA = 0.9;
let peggiore = 1;

for (const file of readdirSync(CARTELLA)
  .filter((f) => f.endsWith('.pdf'))
  .sort()) {
  const xml = execFileSync(
    'pdftotext',
    ['-bbox-layout', '-enc', 'UTF-8', join(CARTELLA, file), '-'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const documento = leggiBbox(xml);
  const esito = segmenta(documento.pagine);
  const riferimento = atteso[file];

  console.log(`\n═══ ${file}`);
  console.log(
    `  pagine ${documento.pagine.length} · parole ${documento.pagine.reduce((s, p) => s + p.parole.length, 0)}`,
  );
  console.log(
    `  colonne riconosciute: ${esito.colonne.map((c) => `${Math.round(c.centro)}${c.bordo === 'destro' ? '→' : ''}`).join(', ')}`,
  );
  console.log(
    `  righe visive ${esito.diagnostica.righeVisive} · intestazioni scartate ${esito.intestazioni.length} · ` +
      `continuazioni unite ${esito.diagnostica.continuazioniUnite} · sezioni ${esito.diagnostica.sezioni}`,
  );

  if (riferimento) {
    const quota = esito.diagnostica.prodotti / riferimento.prodotti;
    peggiore = Math.min(peggiore, quota);
    const segno = quota >= SOGLIA && quota <= 1.05 ? '✓' : '✗';
    console.log(
      `  ${segno} prodotti ${esito.diagnostica.prodotti} su ${riferimento.prodotti} attesi ` +
        `= ${(quota * 100).toFixed(1)}%`,
    );
  } else {
    console.log(`  prodotti individuati: ${esito.diagnostica.prodotti} (nessun riferimento)`);
  }

  if (mostraRighe) {
    for (const riga of esito.righe.filter((r) => r.tipo === 'prodotto').slice(0, 5)) {
      console.log(
        `    p${riga.pagina} · ${riga.celle.map((c) => `[${c.colonna}]${c.testo}`).join(' | ')}`,
      );
    }
    const ignote = esito.righe.filter((r) => r.tipo === 'ignota');
    if (ignote.length) {
      console.log(`    -- ${ignote.length} righe ignote, prime 5:`);
      for (const riga of ignote.slice(0, 5))
        console.log(`       p${riga.pagina} · ${riga.testo.slice(0, 110)}`);
    }
  }
}

console.log(
  `\n${peggiore >= SOGLIA ? '✓' : '✗'} Copertura peggiore ${(peggiore * 100).toFixed(1)}% ` +
    `(criterio della fase: almeno ${SOGLIA * 100}%).`,
);
if (peggiore < SOGLIA) process.exitCode = 1;
