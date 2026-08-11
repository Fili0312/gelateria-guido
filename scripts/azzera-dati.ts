import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { systemPrisma } from '../src/server/database/system-client.js';

/**
 * Svuota il catalogo e gli ordini, lasciando in piedi l'accesso.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/azzera-dati.ts --scrivi
 *
 * Serve per ripartire da zero con dei listini veri prima che l'app sia in
 * uso. **Non si annulla**: prima di lanciarlo il deploy o `backup-db.sh`
 * devono aver prodotto un dump recente, ed è da lì che si torna indietro.
 *
 * Restano: l'organizzazione, gli utenti e le impostazioni — cioè tutto
 * quello che serve per entrare e ritrovare l'app configurata. Sparisce tutto
 * il resto, fornitori compresi: un test che riparte dal catalogo già pieno a
 * metà non prova il percorso vero, che comincia dal creare un fornitore.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');

async function main() {
  const scrivi = process.argv.includes('--scrivi');

  const prima = {
    listini: await systemPrisma.priceList.count(),
    righe: await systemPrisma.priceListRow.count(),
    prodotti: await systemPrisma.product.count(),
    offerte: await systemPrisma.supplierProduct.count(),
    prezzi: await systemPrisma.supplierProductPrice.count(),
    ordini: await systemPrisma.order.count(),
    fornitori: await systemPrisma.supplier.count(),
    reparti: await systemPrisma.department.count(),
    categorie: await systemPrisma.category.count(),
  };
  console.log(`\nDatabase: ${new URL(url!).pathname.slice(1)}\n`);
  for (const [cosa, quante] of Object.entries(prima)) {
    console.log(`  ${String(quante).padStart(5)} ${cosa}`);
  }
  console.log(
    `\n  restano: ${await systemPrisma.user.count()} utenti, ${await systemPrisma.setting.count()} impostazioni\n`,
  );

  if (!scrivi) {
    console.log('(prova a vuoto: rilancia con --scrivi per azzerare davvero)\n');
    await systemPrisma.$disconnect();
    return;
  }

  // L'ordine segue le dipendenze: prima i figli, poi i genitori. Le cascate
  // ci sarebbero anche, ma farle esplicite rende leggibile cosa si perde.
  await systemPrisma.emailDelivery.deleteMany({});
  await systemPrisma.orderDocument.deleteMany({});
  await systemPrisma.orderLine.deleteMany({});
  await systemPrisma.order.deleteMany({});

  await systemPrisma.productBestOffer.deleteMany({});
  await systemPrisma.productMatchCandidate.deleteMany({});
  await systemPrisma.productAlias.deleteMany({});

  await systemPrisma.priceListRow.deleteMany({});
  await systemPrisma.importJob.deleteMany({});
  await systemPrisma.priceList.deleteMany({});

  // Il prezzo corrente punta a una riga di storico e la riga allo stesso
  // prodotto: si slega il puntatore prima di cancellare, o la FK protesta.
  await systemPrisma.supplierProduct.updateMany({ data: { currentPriceId: null } });
  await systemPrisma.supplierProductPrice.deleteMany({});
  await systemPrisma.supplierProduct.deleteMany({});
  await systemPrisma.product.deleteMany({});

  await systemPrisma.supplierImportProfile.deleteMany({});
  await systemPrisma.supplier.deleteMany({});

  await systemPrisma.category.deleteMany({});
  await systemPrisma.department.deleteMany({});

  await systemPrisma.aiCall.deleteMany({});
  await systemPrisma.auditLog.deleteMany({});

  // I PDF caricati e i documenti generati: senza, resterebbero file che il
  // database non conosce più. Il backup li ha già specchiati.
  const storage = process.env.STORAGE_DIR ?? join(process.cwd(), 'storage');
  for (const cartella of ['pdf', 'exports']) {
    await rm(join(storage, cartella), { recursive: true, force: true });
  }

  console.log('✓ Azzerato. Restano organizzazione, utenti e impostazioni.\n');
  await systemPrisma.$disconnect();
}

main().catch(async (e: unknown) => {
  console.error(e);
  await systemPrisma.$disconnect();
  process.exit(1);
});
