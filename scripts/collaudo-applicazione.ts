import { execFileSync } from 'node:child_process';
import { systemPrisma } from '../src/server/database/system-client.js';
import { annullaImport, anteprima, applicaImport } from '../src/server/import/apply.js';

/**
 * Gli undici criteri della Fase 10, su una copia del database di produzione.
 *
 * Il criterio più severo è il penultimo: «`revert` riporta il database
 * esattamente allo stato precedente, verificato con confronto». Qui il
 * confronto è letterale — si fa un dump prima e uno dopo e si guarda se
 * differiscono. Un annullamento «quasi» giusto è peggio di nessun
 * annullamento, perché nessuno va a ricontrollare.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo \
 *     tsx --conditions=react-server scripts/collaudo-applicazione.ts
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === '/gelateria_guido') {
  throw new Error('Questo script applica e annulla import: puntalo su una copia.');
}

function esito(ok: boolean, testo: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) process.exitCode = 1;
}

/** Fotografia delle tabelle che l'import tocca, per il confronto prima/dopo. */
function fotografia(): string {
  return execFileSync(
    'psql',
    [
      url!,
      '-Atc',
      `SELECT string_agg(riga, E'\\n' ORDER BY riga) FROM (
         SELECT 'P|' || id || '|' || name || '|' || unit_size || '|' || coalesce(category_id,'-') AS riga FROM product
         UNION ALL
         SELECT 'SP|' || id || '|' || coalesce(supplier_code,'-') || '|' || pack_quantity || '|' || unit_size || '|' || active || '|' || coalesce(product_id,'-') FROM supplier_product
         UNION ALL
         SELECT 'PR|' || id || '|' || supplier_product_id || '|' || price_net || '|' || valid_from || '|' || coalesce(valid_to::text,'aperto') FROM supplier_product_price
       ) x`,
    ],
    { encoding: 'utf8' },
  ).trim();
}

function conta(tabella: string): number {
  return Number(execFileSync('psql', [url!, '-Atc', `select count(*) from ${tabella}`], { encoding: 'utf8' }).trim());
}

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const utente = await systemPrisma.user.findFirstOrThrow({ select: { id: true } });
  const listini = await systemPrisma.priceList.findMany({
    select: { id: true, scopeLabel: true, supplier: { select: { name: true } } },
    orderBy: { uploadedAt: 'asc' },
  });
  if (listini.length === 0) throw new Error('Servono listini gia estratti.');
  const primo = listini[0]!;

  console.log(`\nStato di partenza: ${conta('product')} prodotti · ${conta('supplier_product')} offerte · ${conta('supplier_product_price')} prezzi`);
  const prima = fotografia();

  console.log(`\n═══ criterio 1: un import reale arriva ad APPLIED ═══`);
  const ante = await anteprima(org.id, primo.id);
  console.log(`  anteprima: ${ante.riepilogo.nuovi} nuovi · ${ante.riepilogo.aggiornati} aggiornati · ${ante.riepilogo.invariati} invariati · ${ante.riepilogo.confezioneCambiata} confezione cambiata · ${ante.riepilogo.spariti} spariti`);
  const applicato = await applicaImport(org.id, primo.id, utente.id);
  const stato = await systemPrisma.priceList.findUniqueOrThrow({
    where: { id: primo.id },
    select: { status: true },
  });
  esito(stato.status === 'APPLIED', `${primo.supplier.name}/${primo.scopeLabel} → ${stato.status}`);
  console.log(`     creati ${applicato.creati} offerte · ${applicato.prodottiCreati} prodotti · ${applicato.prezziScritti} prezzi`);

  console.log('\n═══ criterio 7: i prezzi finiscono nello storico ═══');
  const prezzi = conta('supplier_product_price');
  esito(prezzi === applicato.prezziScritti, `${prezzi} righe di storico`);
  const correnti = Number(
    execFileSync('psql', [url!, '-Atc', 'select count(*) from supplier_product where current_price_id is not null'], { encoding: 'utf8' }).trim(),
  );
  esito(correnti === applicato.creati, `${correnti} offerte con un prezzo corrente`);

  console.log('\n═══ criterio 10: applicare due volte non duplica ne altera ═══');
  let bloccato = false;
  try {
    await applicaImport(org.id, primo.id, utente.id);
  } catch {
    bloccato = true;
  }
  esito(bloccato, 'il secondo tentativo viene rifiutato');
  esito(conta('supplier_product') === applicato.creati, 'nessuna offerta in piu');

  console.log('\n═══ criteri 2, 3: reimportando lo stesso listino, tutto invariato ═══');
  // Si riporta il listino a REVIEW e si rifà l'anteprima: le stesse righe
  // devono ora risultare tutte invariate, non tutte nuove.
  await systemPrisma.priceList.update({ where: { id: primo.id }, data: { status: 'REVIEW' } });
  const seconda = await anteprima(org.id, primo.id);
  esito(
    seconda.riepilogo.invariati === applicato.creati,
    `${seconda.riepilogo.invariati} invariati su ${applicato.creati} (nuovi: ${seconda.riepilogo.nuovi})`,
  );
  esito(seconda.riepilogo.nuovi === 0, 'nessuna riga risulta nuova la seconda volta');
  await systemPrisma.priceList.update({ where: { id: primo.id }, data: { status: 'APPLIED' } });

  console.log('\n═══ criterio 6: due coperture dello stesso fornitore non si cancellano a vicenda ═══');
  const altro = listini.find((l) => l.supplier.name !== primo.supplier.name) ?? listini[1];
  if (altro) {
    const anteAltro = await anteprima(org.id, altro.id);
    esito(
      anteAltro.riepilogo.spariti === 0,
      `applicando ${altro.supplier.name}/${altro.scopeLabel}: ${anteAltro.riepilogo.spariti} spariti (deve essere 0)`,
    );
  }

  console.log('\n═══ criterio 4: stesso codice con confezione diversa va in revisione ═══');
  // Si cambia la confezione di una riga del file: la riconciliazione deve
  // riconoscerla come «da decidere», e l'applicazione deve rifiutarsi.
  await systemPrisma.priceList.update({ where: { id: primo.id }, data: { status: 'REVIEW' } });
  // Una riga che sia davvero un prodotto: la prima del listino e'
  // l'intestazione, e l'anteprima la salta.
  const prodottiDelListino = await systemPrisma.priceListRow.findMany({
    where: { priceListId: primo.id },
    select: { id: true, extracted: true },
    orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }],
  });
  const unaRiga = prodottiDelListino.find(
    (r) => (r.extracted as { tipo?: string } | null)?.tipo === 'prodotto',
  )!;
  const originale = unaRiga.extracted as Record<string, unknown>;
  const campiOriginali = { ...(originale.campi as Record<string, unknown>) };
  await systemPrisma.priceListRow.update({
    where: { id: unaRiga.id },
    data: {
      extracted: { ...originale, campi: { ...campiOriginali, packQuantity: 999 } } as never,
    },
  });

  const conCambio = await anteprima(org.id, primo.id);
  esito(
    conCambio.riepilogo.confezioneCambiata === 1,
    `${conCambio.riepilogo.confezioneCambiata} riga con la confezione cambiata`,
  );

  let rifiutato = false;
  let messaggio = '';
  try {
    await applicaImport(org.id, primo.id, utente.id);
  } catch (e) {
    rifiutato = true;
    messaggio = (e as Error).message;
  }
  esito(rifiutato, 'l applicazione si rifiuta di partire');
  esito(/confezione/i.test(messaggio), `e dice perche: «${messaggio.slice(0, 70)}…»`);

  console.log('\n═══ criterio 8: i prodotti spariti risultano disattivati ═══');
  // Si toglie una riga dal file: il prodotto corrispondente deve risultare
  // sparito, e disattivato — mai cancellato.
  await systemPrisma.priceListRow.update({
    where: { id: unaRiga.id },
    data: { extracted: { ...originale, campi: campiOriginali } as never, excluded: false },
  });
  const daTogliere = [...prodottiDelListino]
    .reverse()
    .find(
      (r) => r.id !== unaRiga.id && (r.extracted as { tipo?: string } | null)?.tipo === 'prodotto',
    )!;
  await systemPrisma.priceListRow.update({
    where: { id: daTogliere.id },
    data: { extracted: { tipo: 'ignota' } as never },
  });

  const conSparito = await anteprima(org.id, primo.id);
  esito(conSparito.riepilogo.spariti === 1, `${conSparito.riepilogo.spariti} prodotto sparito`);
  await systemPrisma.priceList.update({ where: { id: primo.id }, data: { status: 'REVIEW' } });
  const applicato2 = await applicaImport(org.id, primo.id, utente.id);
  esito(applicato2.disattivati === 1, `${applicato2.disattivati} offerta disattivata`);
  const disattivate = Number(
    execFileSync('psql', [url!, '-Atc', 'select count(*) from supplier_product where active = false'], { encoding: 'utf8' }).trim(),
  );
  const totali = conta('supplier_product');
  esito(disattivate === 1 && totali === applicato.creati, `disattivata ma non cancellata (${totali} offerte in tutto)`);

  console.log('\n═══ criterio 9: revert riporta il database allo stato precedente ═══');
  const annullato = await annullaImport(org.id, primo.id);
  console.log(`     rimossi ${annullato.prezziRimossi} prezzi · ${annullato.offerteRimosse} offerte · ${annullato.prodottiRimossi} prodotti · riaperti ${annullato.prezziRiaperti}`);
  const dopo = fotografia();
  esito(dopo === prima, dopo === prima ? 'la fotografia e identica a quella di partenza' : 'DIFFERISCE');
  if (dopo !== prima) {
    const righeP = new Set(prima.split('\n'));
    const righeD = new Set(dopo.split('\n'));
    const soloDopo = [...righeD].filter((r) => !righeP.has(r)).slice(0, 5);
    const soloPrima = [...righeP].filter((r) => !righeD.has(r)).slice(0, 5);
    if (soloDopo.length) console.log('     in piu dopo:', soloDopo);
    if (soloPrima.length) console.log('     mancano dopo:', soloPrima);
  }

  await systemPrisma.$disconnect();
  console.log(process.exitCode ? '\n✗ Almeno un criterio non passa.' : '\n✓ I criteri verificabili qui passano tutti.');
}

main().catch(async (e: unknown) => {
  console.error(e);
  await systemPrisma.$disconnect();
  process.exitCode = 1;
});
