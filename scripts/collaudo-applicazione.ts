import { randomUUID } from 'node:crypto';
import { systemPrisma } from '../src/server/database/system-client.js';
import { normalizzaTesto } from '../src/server/domain/packaging/normalize.js';
import { annullaImport, anteprima, applicaImport } from '../src/server/import/apply.js';

/**
 * Gli undici criteri della Fase 10, su una copia del database di produzione.
 *
 * Il collaudo non applica piu' un listino gia' presente nella copia: crea un
 * fornitore isolato, un listino REVIEW con job DONE e poche righe clonate da
 * un'estrazione reale. In questo modo si puo' rilanciare senza dipendere dallo
 * stato lasciato da un giro precedente e senza modificare dati della copia.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo \
 *     tsx --conditions=react-server scripts/collaudo-applicazione.ts
 *
 * La pulizia e' in un `finally`: anche un criterio rosso rimuove fornitore,
 * listini, catalogo e audit creati dal collaudo.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (decodeURIComponent(new URL(url).pathname).replace(/\/$/, '') === '/gelateria_guido') {
  throw new Error('Questo script applica e annulla import: puntalo su una copia.');
}

function esito(condizione: unknown, testo: string): asserts condizione {
  const ok = Boolean(condizione);
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) throw new Error(`Criterio di collaudo fallito: ${testo}`);
}

function recordJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

interface CampiFixture extends Record<string, unknown> {
  codice: string;
  descrizione: string;
  unitaDiVendita: string;
  prezzoListino: string;
  sconti: number[];
  prezzoNetto: string;
  iva: string;
  unitSize: string;
  unitOfMeasure: 'L';
  packQuantity: number;
  packQuantityConfirmed: boolean;
  contentPerPack: string;
  baseUnit: 'L';
  importabile: true;
}

interface RigaFixture {
  rawText: string;
  rawCells: unknown;
  extracted: Record<string, unknown> & { tipo: 'prodotto'; campi: CampiFixture };
}

interface ContestoFixture {
  organizationId: string;
  userId: string;
  supplierId: string;
  priceListId: string;
  altroScopePriceListId: string;
  rowIds: string[];
  prodottiCreati: string[];
  offertaAggiornataId: string;
  offertaInvariataId: string;
  offertaSparitaId: string;
  offertaAltroScopeId: string;
}

/**
 * Prende solo la forma di tre righe realmente estratte. I valori usati dal
 * dominio vengono poi resi espliciti e innocui: codici, nomi e prezzi sono
 * unici per questo giro, mentre nessun riferimento di matching viene copiato.
 */
async function preparaRigheFixture(
  organizationId: string,
  marcatore: string,
): Promise<RigaFixture[]> {
  const listini = await systemPrisma.priceList.findMany({
    where: { organizationId },
    select: {
      rows: {
        select: { rawText: true, rawCells: true, extracted: true },
        orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }],
      },
    },
    orderBy: { uploadedAt: 'asc' },
  });
  const sorgenti = listini
    .flatMap((listino) => listino.rows)
    .filter((riga) => {
      const estratto = recordJson(riga.extracted);
      const campi = recordJson(estratto.campi);
      return estratto.tipo === 'prodotto' && typeof campi.descrizione === 'string';
    });
  if (sorgenti.length === 0) {
    throw new Error('Serve almeno una riga prodotto gia estratta da clonare nella copia.');
  }

  const prezzi = ['11.0000', '20.0000', '30.0000'] as const;
  return prezzi.map((prezzo, indice) => {
    const sorgente = sorgenti[indice % sorgenti.length]!;
    const estrattoSorgente = recordJson(sorgente.extracted);
    const campiSorgente = recordJson(estrattoSorgente.campi);
    const descrizioneSorgente = String(campiSorgente.descrizione).replace(/\s+/g, ' ').trim();
    const codice = `COLL-${marcatore}-${indice + 1}`;
    const descrizione = `COLLAUDO ${marcatore} ${indice + 1} ${descrizioneSorgente}`.slice(0, 200);
    const campi: CampiFixture = {
      ...campiSorgente,
      codice,
      descrizione,
      unitaDiVendita: 'BT',
      prezzoListino: prezzo,
      sconti: [],
      prezzoNetto: prezzo,
      iva: '22.00',
      unitSize: '1.0000',
      unitOfMeasure: 'L',
      packQuantity: 1,
      // Evita che il ricalcolo derivato della miglior offerta tocchi il
      // prodotto appena creato: il revert deve misurare soltanto l'import.
      packQuantityConfirmed: false,
      contentPerPack: '1.000000',
      baseUnit: 'L',
      importabile: true,
    };
    return {
      rawText: `[COLLAUDO ${marcatore}] ${sorgente.rawText}`,
      rawCells: sorgente.rawCells,
      extracted: { ...estrattoSorgente, tipo: 'prodotto', campi },
    };
  });
}

function varianteCatalogo(riga: RigaFixture, marcatore: string, suffisso: string): CampiFixture {
  return {
    ...riga.extracted.campi,
    codice: `COLL-${marcatore}-${suffisso}`,
    descrizione: `COLLAUDO ${marcatore} ${suffisso}`,
  };
}

async function creaProdottoConOfferta(input: {
  organizationId: string;
  supplierId: string;
  priceListId: string;
  userId: string;
  campi: CampiFixture;
  prezzo: string;
  fingerprint: string;
}): Promise<{ productId: string; supplierProductId: string }> {
  const vistoIl = new Date('2020-01-02T10:00:00.000Z');
  const prodotto = await systemPrisma.product.create({
    data: {
      organizationId: input.organizationId,
      name: input.campi.descrizione,
      unitSize: input.campi.unitSize,
      unitOfMeasure: input.campi.unitOfMeasure,
      baseUnit: input.campi.baseUnit,
      normalizedName: normalizzaTesto(input.campi.descrizione),
      createdBy: 'IMPORT',
    },
    select: { id: true },
  });
  const offerta = await systemPrisma.supplierProduct.create({
    data: {
      organizationId: input.organizationId,
      supplierId: input.supplierId,
      productId: prodotto.id,
      supplierCode: input.campi.codice,
      rawName: input.campi.descrizione,
      normalizedName: normalizzaTesto(input.campi.descrizione),
      packagingType: input.campi.unitaDiVendita,
      packQuantity: input.campi.packQuantity,
      packQuantityConfirmed: input.campi.packQuantityConfirmed,
      unitSize: input.campi.unitSize,
      unitOfMeasure: input.campi.unitOfMeasure,
      contentPerPack: input.campi.contentPerPack,
      baseUnit: input.campi.baseUnit,
      vatRate: input.campi.iva,
      fingerprint: input.fingerprint,
      matchStatus: 'AUTO',
      firstSeenAt: vistoIl,
      lastSeenAt: vistoIl,
      lastSeenPriceListId: input.priceListId,
    },
    select: { id: true },
  });
  const prezzo = await systemPrisma.supplierProductPrice.create({
    data: {
      supplierProductId: offerta.id,
      priceList: input.prezzo,
      discounts: [],
      priceNet: input.prezzo,
      vatRate: input.campi.iva,
      unitPrice: input.prezzo,
      unitPriceBasis: 'PER_L',
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
      source: 'MANUAL',
      createdById: input.userId,
    },
    select: { id: true },
  });
  await systemPrisma.supplierProduct.update({
    where: { id: offerta.id },
    data: { currentPriceId: prezzo.id },
  });
  return { productId: prodotto.id, supplierProductId: offerta.id };
}

async function creaFixture(input: {
  organizationId: string;
  userId: string;
  marcatore: string;
  righe: RigaFixture[];
}): Promise<ContestoFixture> {
  const fornitore = await systemPrisma.supplier.create({
    data: {
      organizationId: input.organizationId,
      name: `COLLAUDO APPLICAZIONE ${input.marcatore}`,
      code: `COLL-${input.marcatore}`,
      pricesIncludeVat: false,
      defaultVatRate: '22.00',
    },
    select: { id: true },
  });

  const altroScope = await systemPrisma.priceList.create({
    data: {
      organizationId: input.organizationId,
      supplierId: fornitore.id,
      originalFilename: `collaudo-altro-scope-${input.marcatore}.pdf`,
      storagePath: `/collaudo/${input.marcatore}/altro-scope.pdf`,
      fileHash: `collaudo-altro-scope-${input.marcatore}`,
      scopeLabel: 'copertura-estranea',
      status: 'APPLIED',
      uploadedById: input.userId,
      appliedAt: new Date('2020-01-03T10:00:00.000Z'),
      job: {
        create: {
          phase: 'DONE',
          progressCurrent: 0,
          progressTotal: 0,
          startedAt: new Date('2020-01-03T09:00:00.000Z'),
          finishedAt: new Date('2020-01-03T09:01:00.000Z'),
        },
      },
    },
    select: { id: true },
  });

  const listino = await systemPrisma.priceList.create({
    data: {
      organizationId: input.organizationId,
      supplierId: fornitore.id,
      originalFilename: `collaudo-applicazione-${input.marcatore}.pdf`,
      storagePath: `/collaudo/${input.marcatore}/applicazione.pdf`,
      fileHash: `collaudo-applicazione-${input.marcatore}`,
      scopeLabel: 'copertura-collaudo',
      status: 'REVIEW',
      uploadedById: input.userId,
      stats: { fixtureCollaudo: true },
      job: {
        create: {
          phase: 'DONE',
          progressCurrent: input.righe.length,
          progressTotal: input.righe.length,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      },
      rows: {
        create: input.righe.map((riga, indice) => ({
          pageNumber: 1,
          lineNumber: indice + 1,
          rawText: riga.rawText,
          rawCells: riga.rawCells as never,
          extracted: riga.extracted as never,
          source: 'MANUAL',
          confidence: '1.000',
          matchStatus: 'NEW',
          proposedAction: 'CREATE',
          productId: null,
          supplierProductId: null,
          reviewedById: input.userId,
          reviewedAt: new Date(),
          excluded: false,
        })),
      },
    },
    select: {
      id: true,
      rows: { select: { id: true }, orderBy: { lineNumber: 'asc' } },
    },
  });

  const aggiornato = await creaProdottoConOfferta({
    organizationId: input.organizationId,
    supplierId: fornitore.id,
    priceListId: listino.id,
    userId: input.userId,
    campi: input.righe[0]!.extracted.campi,
    prezzo: '10.0000',
    fingerprint: `collaudo-${input.marcatore}-aggiornato`,
  });
  const invariato = await creaProdottoConOfferta({
    organizationId: input.organizationId,
    supplierId: fornitore.id,
    priceListId: listino.id,
    userId: input.userId,
    campi: input.righe[1]!.extracted.campi,
    prezzo: input.righe[1]!.extracted.campi.prezzoNetto,
    fingerprint: `collaudo-${input.marcatore}-invariato`,
  });
  const sparito = await creaProdottoConOfferta({
    organizationId: input.organizationId,
    supplierId: fornitore.id,
    priceListId: listino.id,
    userId: input.userId,
    campi: varianteCatalogo(input.righe[0]!, input.marcatore, 'SPARITO'),
    prezzo: '40.0000',
    fingerprint: `collaudo-${input.marcatore}-sparito`,
  });
  const fuoriPerimetro = await creaProdottoConOfferta({
    organizationId: input.organizationId,
    supplierId: fornitore.id,
    priceListId: altroScope.id,
    userId: input.userId,
    campi: varianteCatalogo(input.righe[1]!, input.marcatore, 'ALTRO'),
    prezzo: '50.0000',
    fingerprint: `collaudo-${input.marcatore}-altro`,
  });

  return {
    organizationId: input.organizationId,
    userId: input.userId,
    supplierId: fornitore.id,
    priceListId: listino.id,
    altroScopePriceListId: altroScope.id,
    rowIds: listino.rows.map((riga) => riga.id),
    prodottiCreati: [
      aggiornato.productId,
      invariato.productId,
      sparito.productId,
      fuoriPerimetro.productId,
    ],
    offertaAggiornataId: aggiornato.supplierProductId,
    offertaInvariataId: invariato.supplierProductId,
    offertaSparitaId: sparito.supplierProductId,
    offertaAltroScopeId: fuoriPerimetro.supplierProductId,
  };
}

/**
 * Fotografia letterale del catalogo della fixture. Audit, staging e timestamp
 * `updatedAt` non fanno parte del confronto: registrano intenzionalmente che
 * apply/revert sono avvenuti. Tutti i campi commerciali, i puntatori, le date
 * di validita' e lo storico prezzi invece devono tornare identici.
 */
async function fotografiaCatalogo(supplierId: string): Promise<string> {
  const offerte = await systemPrisma.supplierProduct.findMany({
    where: { supplierId },
    select: {
      id: true,
      supplierCode: true,
      rawName: true,
      normalizedName: true,
      description: true,
      brand: true,
      category: true,
      packQuantity: true,
      packQuantityConfirmed: true,
      extraDiscountExcluded: true,
      extraDiscountPct: true,
      unitSize: true,
      unitOfMeasure: true,
      packagingType: true,
      contentPerPack: true,
      baseUnit: true,
      vatRate: true,
      gtin: true,
      imagePath: true,
      fingerprint: true,
      productId: true,
      matchStatus: true,
      matchConfidence: true,
      currentPriceId: true,
      firstSeenAt: true,
      lastSeenAt: true,
      lastSeenPriceListId: true,
      active: true,
      disappearedAt: true,
      createdAt: true,
      prices: {
        select: {
          id: true,
          priceListId: true,
          priceList: true,
          discounts: true,
          priceNet: true,
          vatRate: true,
          currency: true,
          unitPrice: true,
          unitPriceBasis: true,
          validFrom: true,
          validTo: true,
          source: true,
          createdById: true,
          createdAt: true,
        },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  });
  const prodotti = await systemPrisma.product.findMany({
    where: { supplierProducts: { some: { supplierId } } },
    select: {
      id: true,
      name: true,
      brand: true,
      categoryId: true,
      legacyCategory: true,
      unitSize: true,
      unitOfMeasure: true,
      baseUnit: true,
      gtin: true,
      imagePath: true,
      normalizedName: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      bestOffer: {
        select: {
          bestSupplierProductId: true,
          bestUnitPrice: true,
          bestPriceNet: true,
          offersCount: true,
          spreadPct: true,
          comparable: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  return JSON.stringify({ prodotti, offerte });
}

async function erroreDi(operazione: () => Promise<unknown>): Promise<Error | null> {
  try {
    await operazione();
    return null;
  } catch (errore) {
    return errore instanceof Error ? errore : new Error(String(errore));
  }
}

async function pulisciFixture(supplierId: string, prodottiNoti: readonly string[]): Promise<void> {
  await systemPrisma.$transaction(async (tx) => {
    const listini = await tx.priceList.findMany({
      where: { supplierId },
      select: { id: true },
    });
    const listinoIds = listini.map((listino) => listino.id);
    const offerte = await tx.supplierProduct.findMany({
      where: { supplierId },
      select: { id: true, productId: true },
    });
    const offertaIds = offerte.map((offerta) => offerta.id);
    const productIds = [
      ...new Set([
        ...prodottiNoti,
        ...offerte.map((offerta) => offerta.productId).filter((id): id is string => id !== null),
      ]),
    ];

    if (offertaIds.length > 0 || productIds.length > 0) {
      await tx.productBestOffer.deleteMany({
        where: {
          OR: [
            ...(offertaIds.length > 0 ? [{ bestSupplierProductId: { in: offertaIds } }] : []),
            ...(productIds.length > 0 ? [{ productId: { in: productIds } }] : []),
          ],
        },
      });
    }
    if (listinoIds.length > 0) {
      await tx.priceListRow.updateMany({
        where: { priceListId: { in: listinoIds } },
        data: { supplierProductId: null, productId: null },
      });
    }
    if (offertaIds.length > 0) {
      await tx.supplierProduct.updateMany({
        where: { id: { in: offertaIds } },
        data: { currentPriceId: null, lastSeenPriceListId: null },
      });
      await tx.supplierProductPrice.deleteMany({
        where: { supplierProductId: { in: offertaIds } },
      });
      await tx.supplierProduct.deleteMany({ where: { id: { in: offertaIds } } });
    }
    if (listinoIds.length > 0) {
      await tx.auditLog.deleteMany({
        where: {
          entityType: 'PriceList',
          entityId: { in: listinoIds },
        },
      });
      await tx.priceList.deleteMany({ where: { id: { in: listinoIds } } });
    }
    if (productIds.length > 0) {
      await tx.product.deleteMany({ where: { id: { in: productIds } } });
    }
    await tx.supplier.delete({ where: { id: supplierId } });
  });

  const residui = await systemPrisma.supplier.count({ where: { id: supplierId } });
  esito(residui === 0, 'fixture temporanee eliminate');
}

async function main() {
  const organizzazione = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const utente = await systemPrisma.user.findFirstOrThrow({
    where: { organizationId: organizzazione.id },
    select: { id: true },
  });
  const marcatore = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  const righe = await preparaRigheFixture(organizzazione.id, marcatore);

  let fixture: ContestoFixture | null = null;
  try {
    fixture = await creaFixture({
      organizationId: organizzazione.id,
      userId: utente.id,
      marcatore,
      righe,
    });
    console.log(`\nFixture ${marcatore}: fornitore isolato · 3 righe clonate · job DONE`);

    const statoIniziale = await systemPrisma.priceList.findUniqueOrThrow({
      where: { id: fixture.priceListId },
      select: {
        status: true,
        job: { select: { phase: true } },
        rows: { select: { matchStatus: true, productId: true, supplierProductId: true } },
      },
    });
    esito(
      statoIniziale.status === 'REVIEW' && statoIniziale.job?.phase === 'DONE',
      'fixture applicabile: PriceList REVIEW con job DONE',
    );
    esito(
      statoIniziale.rows.every(
        (riga) =>
          riga.matchStatus === 'NEW' && riga.productId === null && riga.supplierProductId === null,
      ),
      'righe isolate: matchStatus NEW, productId e supplierProductId null',
    );

    const prima = await fotografiaCatalogo(fixture.supplierId);

    console.log('\n═══ criterio 4: stesso codice con confezione diversa va in revisione ═══');
    const rigaConfezione = righe[0]!;
    await systemPrisma.priceListRow.update({
      where: { id: fixture.rowIds[0]! },
      data: {
        extracted: {
          ...rigaConfezione.extracted,
          campi: { ...rigaConfezione.extracted.campi, packQuantity: 2 },
        } as never,
      },
    });
    const conCambio = await anteprima(fixture.organizationId, fixture.priceListId);
    esito(
      conCambio.riepilogo.confezioneCambiata === 1,
      `${conCambio.riepilogo.confezioneCambiata} riga con la confezione cambiata`,
    );
    const erroreConfezione = await erroreDi(() =>
      applicaImport(fixture!.organizationId, fixture!.priceListId, fixture!.userId),
    );
    esito(erroreConfezione !== null, "l'applicazione si rifiuta di partire");
    esito(
      /confezione/i.test(erroreConfezione.message),
      `e dice perche: «${erroreConfezione.message.slice(0, 90)}»`,
    );
    const dopoRifiuto = await systemPrisma.priceList.findUniqueOrThrow({
      where: { id: fixture.priceListId },
      select: { status: true },
    });
    esito(dopoRifiuto.status === 'REVIEW', 'il rifiuto lascia il listino in REVIEW');
    esito(
      (await fotografiaCatalogo(fixture.supplierId)) === prima,
      'il rifiuto non modifica il catalogo',
    );
    await systemPrisma.priceListRow.update({
      where: { id: fixture.rowIds[0]! },
      data: { extracted: rigaConfezione.extracted as never },
    });

    console.log('\n═══ criteri 1, 2, 3, 5, 6, 8: anteprima e applicazione ═══');
    const ante = await anteprima(fixture.organizationId, fixture.priceListId);
    console.log(
      `  anteprima: ${ante.riepilogo.nuovi} nuovi · ${ante.riepilogo.aggiornati} aggiornati · ` +
        `${ante.riepilogo.invariati} invariati · ${ante.riepilogo.confezioneCambiata} confezione cambiata · ` +
        `${ante.riepilogo.spariti} spariti`,
    );
    esito(ante.riepilogo.nuovi === 1, 'un codice nuovo viene riconosciuto come nuovo');
    esito(ante.riepilogo.aggiornati === 1, 'il prodotto identico aggiorna solo il prezzo');
    esito(ante.riepilogo.invariati === 1, 'il prezzo identico resta invariato');
    esito(ante.riepilogo.spariti === 1, 'un prodotto assente risulta sparito');
    esito(ante.riepilogo.confezioneCambiata === 0, 'la confezione ripristinata non blocca');
    esito(
      !ante.confronti.some(
        (confronto) => confronto.supplierProductId === fixture!.offertaAltroScopeId,
      ),
      "l'offerta dell'altra copertura resta fuori dal perimetro",
    );

    const applicato = await applicaImport(
      fixture.organizationId,
      fixture.priceListId,
      fixture.userId,
    );
    const statoApplicato = await systemPrisma.priceList.findUniqueOrThrow({
      where: { id: fixture.priceListId },
      select: { status: true, appliedAt: true, stats: true },
    });
    esito(statoApplicato.status === 'APPLIED', `il listino arriva a ${statoApplicato.status}`);
    esito(
      applicato.creati === 1 && applicato.prodottiCreati === 1,
      `${applicato.creati} offerta e ${applicato.prodottiCreati} prodotto creati`,
    );
    esito(applicato.prezziScritti === 2, `${applicato.prezziScritti} prezzi scritti`);
    esito(applicato.disattivati === 1, `${applicato.disattivati} offerta disattivata`);
    const snapshot = recordJson(recordJson(statoApplicato.stats).applicazione);
    esito(
      snapshot.version === 1 && Array.isArray(snapshot.offertePrima),
      "l'apply salva la fotografia richiesta dal revert sicuro",
    );

    console.log('\n═══ criterio 7: i prezzi finiscono nello storico ═══');
    const prezziFixture = await systemPrisma.supplierProductPrice.count({
      where: { supplierProduct: { supplierId: fixture.supplierId } },
    });
    esito(prezziFixture === 6, 'quattro prezzi iniziali + due righe di storico');
    const prezzoAggiornato = await systemPrisma.supplierProduct.findUniqueOrThrow({
      where: { id: fixture.offertaAggiornataId },
      select: { currentPrice: { select: { priceNet: true } }, prices: { select: { id: true } } },
    });
    esito(
      prezzoAggiornato.currentPrice?.priceNet.toString() === '11' &&
        prezzoAggiornato.prices.length === 2,
      'il prezzo nuovo e corrente e il precedente resta nello storico',
    );
    const invariata = await systemPrisma.supplierProduct.findUniqueOrThrow({
      where: { id: fixture.offertaInvariataId },
      select: { prices: { select: { id: true } } },
    });
    esito(invariata.prices.length === 1, 'il prezzo invariato non duplica lo storico');

    const offertaSparita = await systemPrisma.supplierProduct.findUniqueOrThrow({
      where: { id: fixture.offertaSparitaId },
      select: { active: true, disappearedAt: true },
    });
    esito(
      !offertaSparita.active && offertaSparita.disappearedAt !== null,
      'lo sparito e disattivato, non cancellato',
    );
    const altraCopertura = await systemPrisma.supplierProduct.findUniqueOrThrow({
      where: { id: fixture.offertaAltroScopeId },
      select: { active: true },
    });
    esito(altraCopertura.active, "l'altra copertura non viene disattivata");

    console.log('\n═══ criterio 10: applicare due volte non duplica ne altera ═══');
    const dopoApply = await fotografiaCatalogo(fixture.supplierId);
    const erroreRetry = await erroreDi(() =>
      applicaImport(fixture!.organizationId, fixture!.priceListId, fixture!.userId),
    );
    esito(erroreRetry !== null, 'il secondo tentativo viene rifiutato');
    esito(/revisione/i.test(erroreRetry.message), `motivo esplicito: «${erroreRetry.message}»`);
    esito(
      (await fotografiaCatalogo(fixture.supplierId)) === dopoApply,
      'il secondo tentativo non altera catalogo o storico',
    );

    console.log('\n═══ criterio 9: revert riporta il catalogo allo stato precedente ═══');
    const annullato = await annullaImport(
      fixture.organizationId,
      fixture.priceListId,
      fixture.userId,
    );
    console.log(
      `     rimossi ${annullato.prezziRimossi} prezzi · ${annullato.offerteRimosse} offerte · ` +
        `${annullato.prodottiRimossi} prodotti · riaperti ${annullato.prezziRiaperti}`,
    );
    esito(
      annullato.prezziRimossi === 2 &&
        annullato.offerteRimosse === 1 &&
        annullato.prodottiRimossi === 1 &&
        annullato.offerteRiattivate === 1,
      'il revert rimuove solo quanto creato e riattiva lo sparito',
    );
    const statoRevert = await systemPrisma.priceList.findUniqueOrThrow({
      where: { id: fixture.priceListId },
      select: { status: true, appliedAt: true, revertedAt: true },
    });
    esito(
      statoRevert.status === 'REVERTED' &&
        statoRevert.appliedAt === null &&
        statoRevert.revertedAt !== null,
      `il listino arriva a ${statoRevert.status}`,
    );
    const dopoRevert = await fotografiaCatalogo(fixture.supplierId);
    esito(dopoRevert === prima, 'la fotografia del catalogo e identica a quella di partenza');
  } finally {
    if (fixture) {
      await pulisciFixture(fixture.supplierId, fixture.prodottiCreati);
    }
  }

  console.log('\n✓ Tutti i criteri verificabili qui passano e la fixture e stata rimossa.');
}

main()
  .catch(async (errore: unknown) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(async () => {
    await systemPrisma.$disconnect();
  });
