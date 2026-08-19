import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { systemPrisma } from '../src/server/database/system-client.js';
import { percorsoAssoluto } from '../src/server/import/storage.js';

/**
 * Cancella gli ordini di prova e rinumera quello vero.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/ripulisci-ordini-di-prova.ts --tieni 2026-0004 --scrivi
 *
 * ── Perché è un comando e non un bottone ────────────────────────────────
 * Cancellare un ordine confermato **non si fa** dall'app, e non è una
 * dimenticanza: un ordine è un documento mandato a qualcuno, e sparire dalla
 * numerazione lascia un buco che in contabilità è una domanda. L'app offre
 * infatti «annulla», che lo lascia lì con scritto cosa è successo.
 *
 * Qui si sta facendo un'altra cosa: si sta buttando via la spazzatura di un
 * collaudo prima che l'app entri in uso, e si rinumera l'unico ordine vero
 * perché parta da uno. È un'operazione da fare una volta sola, prima che
 * qualcuno abbia in mano quei numeri — dopo non si può più.
 *
 * **Non si annulla.** Prima di lanciarlo serve un backup recente: `deploy.sh`
 * ne fa uno a ogni pubblicazione, ed è da lì che si torna indietro.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const scrivi = process.argv.includes('--scrivi');
  const tieni = argomento('--tieni');
  if (!tieni) throw new Error('Indicare --tieni <codice ordine>, es. --tieni 2026-0004');

  const ordini = await systemPrisma.order.findMany({
    select: {
      id: true,
      code: true,
      status: true,
      totalNet: true,
      _count: { select: { lines: true, documents: true } },
    },
    orderBy: [{ code: 'asc' }],
  });

  const superstite = ordini.find((o) => o.code === tieni);
  if (!superstite) throw new Error(`Nessun ordine col codice ${tieni}.`);

  // Le bozze non hanno numero e non sono ordini: restano fuori dal conto,
  // ma una bozza lasciata a metà da un collaudo va svuotata lo stesso.
  const daCancellare = ordini.filter((o) => o.id !== superstite.id && o.status !== 'DRAFT');
  const bozze = ordini.filter((o) => o.status === 'DRAFT' && o._count.lines > 0);

  const anno = tieni.slice(0, 4);
  const nuovoCodice = `${anno}-0001`;

  console.log('Da cancellare:');
  for (const o of daCancellare) {
    console.log(
      `  ${o.code ?? '(senza numero)'}  ${o.status.padEnd(9)} ` +
        `${o._count.lines} righe · ${o._count.documents} documenti · ${o.totalNet.toString()} €`,
    );
  }
  console.log(`\nDa tenere:  ${superstite.code} → rinumerato ${nuovoCodice}`);
  console.log(`  ${superstite._count.lines} righe · ${superstite._count.documents} documenti`);
  for (const b of bozze) console.log(`\nBozza da svuotare: ${b._count.lines} righe`);

  if (!scrivi) {
    console.log('\nNulla è stato scritto. Rilancia con --scrivi.');
    return;
  }

  for (const o of daCancellare) {
    // Prima i figli che non hanno cascata dichiarata, poi l'ordine.
    await systemPrisma.emailDelivery.deleteMany({ where: { orderId: o.id } });
    await systemPrisma.orderDocument.deleteMany({ where: { orderId: o.id } });
    await systemPrisma.orderLine.deleteMany({ where: { orderId: o.id } });
    await systemPrisma.order.delete({ where: { id: o.id } });
    // I file generati: senza questo restano megabyte orfani sul disco.
    await rm(percorsoAssoluto(join('exports', o.id)), { recursive: true, force: true }).catch(
      () => {},
    );
    console.log(`cancellato ${o.code ?? o.id}`);
  }

  for (const b of bozze) {
    await systemPrisma.orderLine.deleteMany({ where: { orderId: b.id } });
    console.log('bozza svuotata');
  }

  if (superstite.code !== nuovoCodice) {
    await systemPrisma.order.update({
      where: { id: superstite.id },
      data: { code: nuovoCodice },
    });
    console.log(`${superstite.code} rinumerato ${nuovoCodice}`);
    console.log('I documenti già generati portano ancora il numero vecchio: vanno rigenerati.');
  }
}

main()
  .catch((errore: unknown) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => systemPrisma.$disconnect());
