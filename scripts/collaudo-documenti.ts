import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Decimal } from 'decimal.js';
import ExcelJS from 'exceljs';
import { businessCalendarDay } from '../src/features/prices/date.js';
import { systemPrisma } from '../src/server/database/system-client.js';
import { datiOrdine } from '../src/server/export/dati.js';
import { TEMPLATE } from '../src/server/export/registro.js';
import { orderDocumentsRepository } from '../src/server/repositories/order-documents.js';
import { ordersRepository } from '../src/server/repositories/orders.js';

/**
 * I sette criteri della Fase 16, su una copia.
 *
 *   DATABASE_URL=postgresql://.../gelateria_documenti \
 *     tsx --conditions=react-server scripts/collaudo-documenti.ts
 *
 * I PDF si verificano **leggendone il testo** con `pdftotext`, non guardando
 * quanti byte pesano. Un PDF da 18 kB con dentro le righe del fornitore
 * sbagliato pesa esattamente quanto uno giusto.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === '/gelateria_guido') {
  throw new Error('Questo script conferma ordini e scrive file: puntalo su una copia.');
}

let falliti = 0;
function esito(ok: boolean, testo: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) {
    falliti += 1;
    process.exitCode = 1;
  }
}

const cartella = mkdtempSync(join(tmpdir(), 'collaudo-documenti-'));

/** Il testo di un PDF, come lo legge chi lo apre. */
function testoDelPdf(contenuto: Buffer): string {
  const percorso = join(cartella, `${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(percorso, contenuto);
  // `-layout` conserva l'allineamento delle colonne: senza, i numeri di una
  // tabella escono mescolati e non si capisce quale sta su quale riga.
  return execFileSync('pdftotext', ['-layout', percorso, '-'], { encoding: 'utf8' });
}

/** Gli euro come li scrive il PDF: `1.234,56 €` → `1234.56` */
function importiNel(testo: string): string[] {
  return [...testo.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g)].map((m) =>
    m[1]!.replace(/\./g, '').replace(',', '.'),
  );
}

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const utente = await systemPrisma.user.findFirstOrThrow({ select: { id: true } });
  const ordini = ordersRepository(org.id);
  const documenti = orderDocumentsRepository(org.id);

  await systemPrisma.orderDocument.deleteMany({});
  await systemPrisma.orderLine.deleteMany({});
  await systemPrisma.order.deleteMany({});

  // L'intestazione: senza, il PDF non dice al fornitore chi sta ordinando.
  for (const [chiave, valore] of [
    ['documenti.intestazione.nome', 'Gelateria Guido di Prova'],
    ['documenti.intestazione.indirizzo', 'Via del Collaudo 1, 62012 Civitanova (MC)'],
    ['documenti.intestazione.partitaIva', 'IT00000000000'],
  ] as const) {
    await systemPrisma.setting.upsert({
      where: { organizationId_key: { organizationId: org.id, key: chiave } },
      create: { organizationId: org.id, key: chiave, value: valore },
      update: { value: valore },
    });
  }

  console.log('\n── Criterio 1: tre fornitori, tre PDF, ciascuno coi suoi ───────\n');

  // Tre fornitori diversi: è il caso che questa fase esiste per risolvere.
  //
  // Si prendono solo articoli **esclusivi** di un fornitore. Da quando il
  // catalogo ha più fornitori sullo stesso prodotto, la verifica «nel PDF di
  // Barzetti non c'è nessuna riga degli altri» non si può fare sui nomi: la
  // Red Bull la vendono in tre e il nome è identico in tutti e tre i
  // documenti, giustamente. Con articoli esclusivi il controllo torna a
  // dire quello che deve dire.
  const esclusivi = (
    await systemPrisma.product.findMany({
      where: { supplierProducts: { some: { active: true, currentPriceId: { not: null } } } },
      select: { id: true, _count: { select: { supplierProducts: true } } },
    })
  )
    .filter((p) => p._count.supplierProducts === 1)
    .map((p) => p.id);

  const offerte = await systemPrisma.supplierProduct.findMany({
    where: {
      organizationId: org.id,
      active: true,
      currentPriceId: { not: null },
      productId: { in: esclusivi },
    },
    select: {
      id: true,
      supplierId: true,
      supplierCode: true,
      supplier: { select: { name: true } },
    },
    take: 400,
  });
  const perFornitore = new Map<string, (typeof offerte)[number][]>();
  for (const o of offerte) {
    const elenco = perFornitore.get(o.supplierId) ?? [];
    if (elenco.length < 3) elenco.push(o);
    perFornitore.set(o.supplierId, elenco);
  }
  // La copia di produzione ha due fornitori a listino, il criterio ne chiede
  // tre. Il terzo se lo fabbrica il collaudo: ridurre il criterio a «due
  // fornitori» sarebbe provare qualcosa di diverso da quello che serve —
  // con due, un PDF che contenesse tutto sarebbe indistinguibile da uno che
  // contiene il complemento dell'altro.
  if (perFornitore.size < 3) {
    const terzo = await systemPrisma.supplier.create({
      data: {
        organizationId: org.id,
        name: 'Fornitore di Collaudo S.r.l.',
        vatNumber: 'IT99999999999',
        address: 'Via delle Prove 9, 62012 Civitanova (MC)',
        orderEmail: 'ordini@collaudo.example',
      },
      select: { id: true },
    });
    const finti: (typeof offerte)[number][] = [];
    for (let i = 1; i <= 3; i++) {
      const offerta = await systemPrisma.supplierProduct.create({
        data: {
          organizationId: org.id,
          supplierId: terzo.id,
          supplierCode: `COLL-${100 + i}`,
          rawName: `Articolo di collaudo numero ${i}`,
          normalizedName: `articolo di collaudo numero ${i}`,
          packQuantity: 6,
          unitSize: '70',
          unitOfMeasure: 'CL',
          contentPerPack: '4.2',
          baseUnit: 'L',
          fingerprint: `collaudo-${i}-${Date.now()}`,
        },
        select: { id: true, supplierId: true, supplierCode: true },
      });
      const prezzo = await systemPrisma.supplierProductPrice.create({
        data: {
          supplierProductId: offerta.id,
          priceList: `${10 + i}.5000`,
          priceNet: `${10 + i}.5000`,
          unitPrice: `${((10 + i + 0.5) / 4.2).toFixed(6)}`,
          unitPriceBasis: 'PER_L',
          vatRate: '22.00',
          validFrom: new Date(),
        },
        select: { id: true },
      });
      await systemPrisma.supplierProduct.update({
        where: { id: offerta.id },
        data: { currentPriceId: prezzo.id },
      });
      finti.push({ ...offerta, supplier: { name: 'Fornitore di Collaudo S.r.l.' } });
    }
    perFornitore.set(terzo.id, finti);
    console.log('     (terzo fornitore fabbricato per il collaudo)');
  }

  const scelti = [...perFornitore.entries()].slice(0, 3);
  if (scelti.length < 3) {
    throw new Error(`Servono tre fornitori: nella copia ce ne sono ${scelti.length}.`);
  }
  for (const [, gruppo] of scelti) {
    for (const offerta of gruppo) {
      await ordini.aggiungiRiga(utente.id, { supplierProductId: offerta.id, quantityPacks: 2 });
    }
  }

  const riepilogo = await ordini.riepilogo(utente.id);
  const corrente = riepilogo.ordine;
  const confermato = await ordini.conferma(utente.id, {
    orderId: corrente.id,
    updatedAt: corrente.updatedAt,
    priceVersion: riepilogo.priceVersion,
    note: corrente.note,
  });
  console.log(`     ordine ${confermato.code} · ${scelti.length} fornitori · 9 righe`);

  const prodotti = await documenti.genera(utente.id, confermato.orderId);
  const pdf = prodotti.filter((d) => d.format === 'PDF');
  const xlsx = prodotti.filter((d) => d.format === 'XLSX');
  esito(pdf.length === 3, `tre PDF, uno per fornitore (${pdf.length})`);
  esito(xlsx.length === 1, `un Excel riepilogativo (${xlsx.length})`);
  esito(
    new Set(pdf.map((d) => d.supplierId)).size === 3,
    'i tre PDF sono di tre fornitori diversi',
  );

  const dati = (await datiOrdine(org.id, confermato.orderId))!;
  const testi = new Map<string, string>();
  for (const documento of pdf) {
    const scaricato = (await documenti.scarica(confermato.orderId, documento.id))!;
    testi.set(documento.supplierId!, testoDelPdf(scaricato.contenuto));
  }

  for (const gruppo of dati.gruppi) {
    const testo = testi.get(gruppo.supplierId)!;
    const altri = dati.gruppi.filter((g) => g.supplierId !== gruppo.supplierId);
    // Ogni riga sua c'è…
    const tutteLeSue = gruppo.righe.every((r) => testo.includes(r.name.slice(0, 24)));
    // …e nessuna riga degli altri. È la metà che conta: un PDF che contiene
    // tutto contiene anche tutto il giusto, e passerebbe il primo controllo.
    const nessunaDegliAltri = altri.every((a) =>
      a.righe.every((r) => !testo.includes(r.name.slice(0, 24))),
    );
    esito(
      tutteLeSue && nessunaDegliAltri,
      `${gruppo.supplierName}: ci sono le sue ${gruppo.righe.length} righe e nessuna degli altri`,
    );
    esito(
      testo.includes(gruppo.supplierName) && altri.every((a) => !testo.includes(a.supplierName)),
      `…e in testa c'è solo il suo nome`,
    );
  }

  console.log('\n── Criterio 2: i nomi contengono fornitore e data, e si ordinano ─\n');

  const nomi = prodotti.map((d) => d.fileName);
  // La data del nome è quella **della gelateria**, non quella del server: il
  // server sta a UTC, e alle 23:15 di qui in Italia è già domani. Misurare
  // con l'orologio del server faceva fallire il controllo una notte su tre.
  const dataAttesa = businessCalendarDay(new Date());
  esito(
    nomi.every((n) => n.startsWith(dataAttesa)),
    `tutti cominciano con la data (${dataAttesa})`,
  );
  esito(
    pdf.every((d) => {
      const fornitore = dati.gruppi.find((g) => g.supplierId === d.supplierId)!.supplierName;
      const primaParola = fornitore
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .split('-')[0]!;
      return d.fileName.includes(primaParola);
    }),
    'ogni PDF ha dentro il nome del fornitore',
  );
  esito(
    nomi.every((n) => n === n.normalize('NFC') && !/[^\x20-\x7e]/.test(n)),
    'nessun accento né carattere strano: passano per header HTTP e allegati',
  );
  console.log(`     ${nomi.slice().sort().join('\n     ')}`);

  // La data nel nome deve essere quella della **conferma**, non quella di
  // oggi: su un ordine confermato oggi le due coincidono, e finché
  // coincidono il controllo qui sopra non distingue le due cose. Si
  // retrodata la conferma e si rigenera.
  await systemPrisma.order.update({
    where: { id: confermato.orderId },
    data: { confirmedAt: new Date(2026, 2, 17, 9, 0) },
  });
  const retrodatati = await documenti.genera(utente.id, confermato.orderId);
  const nuoviNomi = retrodatati.filter((d) => !nomi.includes(d.fileName)).map((d) => d.fileName);
  esito(
    nuoviNomi.length === 4 && nuoviNomi.every((n) => n.startsWith('2026-03-17')),
    `retrodatando la conferma il nome segue l'ordine, non l'orologio (${nuoviNomi[0] ?? 'nessun nome nuovo'})`,
  );
  await systemPrisma.orderDocument.deleteMany({
    where: { fileName: { in: nuoviNomi } },
  });
  await systemPrisma.order.update({
    where: { id: confermato.orderId },
    data: { confirmedAt: new Date() },
  });

  console.log('\n── Criterio 3: il codice articolo è quello del fornitore ────────\n');

  let codiciTrovati = 0;
  let codiciAttesi = 0;
  for (const gruppo of dati.gruppi) {
    const testo = testi.get(gruppo.supplierId)!;
    for (const riga of gruppo.righe) {
      if (!riga.supplierCode) continue;
      codiciAttesi += 1;
      if (testo.includes(riga.supplierCode)) codiciTrovati += 1;
    }
  }
  if (codiciAttesi === 0) {
    // Non è un rosso: è un listino che i codici non li ha. Dirlo è meglio di
    // far fallire un criterio che su questi dati non si può provare — e
    // meglio di farlo passare, che nasconderebbe una regressione vera.
    console.log(
      '  ~ nessun articolo di questo campione ha un codice fornitore: criterio non verificabile',
    );
  } else {
    esito(
      codiciTrovati === codiciAttesi,
      `i ${codiciAttesi} codici articolo del fornitore sono tutti sul PDF (${codiciTrovati})`,
    );
  }
  // E il nostro id non c'è: stamparlo non serve a nessuno e confonde chi legge.
  const righeDb = await systemPrisma.orderLine.findMany({
    where: { orderId: confermato.orderId },
    select: { id: true, supplierProductId: true, supplierId: true },
  });
  esito(
    [...testi.values()].every((t) =>
      righeDb.every((r) => !t.includes(r.id) && !t.includes(r.supplierProductId)),
    ),
    'e i nostri identificativi interni non compaiono',
  );

  console.log('\n── Criterio 4: i totali coincidono al centesimo ─────────────────\n');

  for (const gruppo of dati.gruppi) {
    const testo = testi.get(gruppo.supplierId)!;
    const importi = importiNel(testo);
    // Il totale sul PDF è l'**imponibile**: l'IVA non si calcola, si scrive
    // «+ IVA». L'aliquota di ogni articolo quasi mai arriva dal listino, e
    // sommarne una predefinita darebbe un numero che la fattura smentisce.
    const suo = new Decimal(gruppo.netto);
    esito(
      importi.includes(suo.toFixed(2)),
      `${gruppo.supplierName}: il totale ${suo.toFixed(2)} € (+ IVA) è sul PDF`,
    );
    // E il totale dell'ordine intero **non** c'è: sarebbe il numero più
    // grande in fondo alla pagina, e chi riceve legge quello.
    const intero = new Decimal(dati.totali.netto);
    esito(
      intero.equals(suo) || !importi.includes(intero.toFixed(2)),
      `…e il totale dell'ordine intero (${intero.toFixed(2)} €) non compare`,
    );
  }
  const sommaGruppi = dati.gruppi.reduce((a, g) => a.plus(g.netto), new Decimal(0));
  const ordineDb = await systemPrisma.order.findUniqueOrThrow({
    where: { id: confermato.orderId },
    select: { totalNet: true, totalGross: true },
  });
  esito(
    sommaGruppi.equals(new Decimal(ordineDb.totalNet.toString())),
    `la somma dei tre PDF è il netto dell'ordine: ${sommaGruppi} = ${ordineDb.totalNet}`,
  );

  console.log('\n── Criterio 5: l’Excel si apre e i numeri sono numeri ───────────\n');

  const excel = (await documenti.scarica(confermato.orderId, xlsx[0]!.id))!;
  const cartellaExcel = new ExcelJS.Workbook();
  await cartellaExcel.xlsx.load(excel.contenuto as unknown as ArrayBuffer);
  const foglio = cartellaExcel.worksheets[0]!;
  esito(cartellaExcel.worksheets.length === 1, 'un foglio solo, si apre senza errori');

  const celleTotale: number[] = [];
  let righeArticolo = 0;
  foglio.eachRow((riga) => {
    const prezzo = riga.getCell(7).value;
    const totale = riga.getCell(8).value;
    if (typeof prezzo === 'number' && typeof totale === 'number') {
      righeArticolo += 1;
      celleTotale.push(totale);
    }
  });
  esito(
    righeArticolo >= 9,
    `${righeArticolo} righe con prezzo e totale come **numeri**, non come testo`,
  );
  const sommaExcel = new Decimal(
    celleTotale.slice(0, 9).reduce((a, n) => a + n, 0),
  ).toDecimalPlaces(2);
  esito(
    sommaExcel.equals(new Decimal(ordineDb.totalNet.toString())),
    `sommando le righe dell'Excel torna il netto: ${sommaExcel} = ${ordineDb.totalNet}`,
  );
  esito(
    foglio.autoFilter !== undefined && foglio.autoFilter !== null,
    'il filtro automatico è sulla testata',
  );

  console.log('\n── Criterio 6: si riscaricano identici ──────────────────────────\n');

  const primo = pdf[0]!;
  const a = (await documenti.scarica(confermato.orderId, primo.id))!;
  const b = (await documenti.scarica(confermato.orderId, primo.id))!;
  esito(a.contenuto.equals(b.contenuto), 'due scaricamenti danno gli stessi byte');
  esito(
    a.contenuto.byteLength === primo.sizeBytes,
    `la dimensione registrata è quella vera (${primo.sizeBytes} byte)`,
  );

  // «Passano i sei mesi»: si distrugge tutto ciò che il documento
  // referenziava, e il file già generato non si muove di un byte.
  // Uno per uno: il nome del fornitore è unico per organizzazione, e
  // rinominarli tutti uguali violerebbe il vincolo.
  const daRinominare = [...new Set(righeDb.map((r) => r.supplierId))];
  for (const [indice, supplierId] of daRinominare.entries()) {
    await systemPrisma.supplier.update({
      where: { id: supplierId },
      data: { name: `FORNITORE CAMBIATO ${indice + 1}`, address: 'ALTROVE' },
    });
  }
  await systemPrisma.supplierProduct.updateMany({
    where: { id: { in: righeDb.map((r) => r.supplierProductId) } },
    data: { rawName: 'RINOMINATO DOPO', active: false },
  });
  const dopo = (await documenti.scarica(confermato.orderId, primo.id))!;
  esito(
    dopo.contenuto.equals(a.contenuto),
    'dopo aver rinominato fornitori e prodotti il PDF è ancora identico',
  );
  esito(
    !testoDelPdf(dopo.contenuto).includes('FORNITORE CAMBIATO'),
    'e dentro non c’è traccia dei nomi nuovi',
  );

  const archivio = (await documenti.archivio(confermato.orderId))!;
  esito(archivio.fileName.endsWith('.zip'), `lo zip si chiama ${archivio.fileName}`);
  const percorsoZip = join(cartella, 'documenti.zip');
  writeFileSync(percorsoZip, archivio.contenuto);
  const dentro = execFileSync('unzip', ['-Z1', percorsoZip], { encoding: 'utf8' })
    .trim()
    .split('\n');
  esito(dentro.length === 4, `dentro ci sono i 4 documenti (${dentro.length})`);
  esito(
    dentro.every((n) => prodotti.some((d) => d.fileName === n)),
    'coi nomi giusti',
  );

  console.log('\n── Rigenerare non cancella l’originale ──────────────────────────\n');

  const dopoRigenerazione = await documenti.genera(utente.id, confermato.orderId);
  esito(
    dopoRigenerazione.length === prodotti.length * 2,
    `i vecchi restano: ${dopoRigenerazione.length} documenti dopo la seconda generazione`,
  );
  const ancora = await documenti.scarica(confermato.orderId, primo.id);
  esito(
    ancora !== null && ancora.contenuto.equals(a.contenuto),
    'e il file mandato al fornitore si riscarica ancora, identico',
  );
  const zipDopo = (await documenti.archivio(confermato.orderId))!;
  writeFileSync(percorsoZip, zipDopo.contenuto);
  esito(
    execFileSync('unzip', ['-Z1', percorsoZip], { encoding: 'utf8' }).trim().split('\n').length ===
      4,
    'lo zip contiene solo l’ultima generazione, non otto file',
  );

  console.log('\n── Criterio 7: un formato nuovo non esce da server/export ───────\n');

  // Nessun file fuori da `server/export/` nomina una chiave di template: se
  // qualcuno le nomina, aggiungerne una richiede di modificarlo.
  const chiavi = TEMPLATE.map((t) => t.key);
  const fuori = execFileSync(
    'bash',
    [
      '-c',
      `grep -rl -F ${chiavi.map((k) => `-e '${k}'`).join(' ')} src/ scripts/ 2>/dev/null | grep -v '^src/server/export/' || true`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter((r) => r && !r.startsWith('scripts/collaudo-'));
  esito(
    fuori.length === 0,
    fuori.length === 0
      ? 'nessun file fuori da server/export/ nomina una chiave di template'
      : `questi file nominano una chiave: ${fuori.join(', ')}`,
  );
  esito(
    TEMPLATE.every((t) => typeof t.build === 'function' && typeof t.nomeFile === 'function'),
    `i ${TEMPLATE.length} template registrati rispettano l'interfaccia`,
  );

  await systemPrisma.$disconnect();
  console.log(`\n${falliti === 0 ? 'Tutto verde.' : `${falliti} controlli falliti.`}\n`);
}

main().catch(async (errore: unknown) => {
  console.error(errore);
  await systemPrisma.$disconnect();
  process.exit(1);
});
