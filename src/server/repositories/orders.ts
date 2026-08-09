import 'server-only';

import { Decimal } from 'decimal.js';
import type {
  OffertaOrdinabile,
  OrdineCorrente,
  RigaOrdine,
  RisultatoOrdinabile,
} from '@/features/orders/dto';
import type { RicercaOrdinabile, RigaOrdineInput, RigaOrdinePatch } from '@/features/orders/schema';
import { prismaForOrganization, transactionForOrganization, type OrganizationPrismaClient } from '@/server/db';
import { calcolaCambio, confrontaPerAvviso, type OffertaPerAvviso } from '@/server/domain/orders/alert';
import { totaliOrdine, totaliRiga } from '@/server/domain/orders/totals';
import { SETTINGS_ALL_KEYS, valoriDaRighe } from '@/features/settings/schema';
import { settingsRepository } from './settings';
import { comparisonRepository } from './comparison';
import { productsRepository } from './products';
import { CATEGORY_REF_SELECT, mapCategoryRef } from './taxonomy';

/**
 * L'ordine in corso.
 *
 * ── Perché la bozza si crea dentro una transazione ──────────────────────
 * «L'ordine sopravvive a refresh, chiusura e cambio dispositivo» significa
 * che due schede aperte devono trovare **la stessa** bozza. Senza
 * serializzazione, due richieste simultanee ne creerebbero due, e ognuna
 * mostrerebbe metà della spesa senza che nulla lo segnali.
 * `transactionForOrganization` gira a isolamento Serializable e ritenta:
 * PostgreSQL aborta la seconda creazione, il retry rilegge e trova la prima.
 *
 * ── Perché si fotografa tutto al momento dell'aggiunta ──────────────────
 * Nome, confezione, prezzo e IVA finiscono nella riga come copie. Un ordine
 * è un documento: se domani il fornitore cambia listino, l'ordine di ieri
 * deve continuare a dire cosa si era ordinato e a che prezzo. Leggere il
 * prezzo dal listino al momento della stampa produrrebbe un documento che
 * cambia da solo.
 */

export class OrderNotFoundError extends Error {
  override readonly name = 'OrderNotFoundError';
}

export class OrderValidationError extends Error {
  override readonly name = 'OrderValidationError';
}

const RIGA_SELECT = {
  id: true,
  supplierProductId: true,
  productId: true,
  supplierId: true,
  supplierNameSnapshot: true,
  supplierCodeSnapshot: true,
  nameSnapshot: true,
  packQuantitySnapshot: true,
  unitSizeSnapshot: true,
  uomSnapshot: true,
  unitPriceNetSnapshot: true,
  vatRateSnapshot: true,
  unitPriceBasisSnapshot: true,
  lineTotalNet: true,
  lineTotalGross: true,
  quantityPacks: true,
  position: true,
  note: true,
  overrideReason: true,
  bestAlternativeSnapshot: true,
  supplierProduct: { select: { packagingType: true, contentPerPack: true } },
} as const;

type RigaRecord = {
  id: string;
  supplierProductId: string;
  productId: string | null;
  supplierId: string;
  supplierNameSnapshot: string;
  supplierCodeSnapshot: string | null;
  nameSnapshot: string;
  packQuantitySnapshot: number;
  unitSizeSnapshot: { toString(): string };
  uomSnapshot: string;
  unitPriceNetSnapshot: { toString(): string };
  vatRateSnapshot: { toString(): string } | null;
  unitPriceBasisSnapshot: string;
  lineTotalNet: { toString(): string };
  lineTotalGross: { toString(): string };
  quantityPacks: number;
  position: number;
  note: string | null;
  overrideReason: string | null;
  bestAlternativeSnapshot: unknown;
  supplierProduct: { packagingType: string | null; contentPerPack: { toString(): string } };
};

function mapRiga(r: RigaRecord): RigaOrdine {
  const netto = new Decimal(r.unitPriceNetSnapshot.toString());
  const contenuto = new Decimal(r.supplierProduct.contentPerPack.toString());
  return {
    id: r.id,
    supplierProductId: r.supplierProductId,
    productId: r.productId,
    supplierId: r.supplierId,
    supplierName: r.supplierNameSnapshot,
    supplierCode: r.supplierCodeSnapshot,
    name: r.nameSnapshot,
    packQuantity: r.packQuantitySnapshot,
    unitSize: r.unitSizeSnapshot.toString(),
    unitOfMeasure: r.uomSnapshot as RigaOrdine['unitOfMeasure'],
    packagingType: r.supplierProduct.packagingType,
    priceNet: netto.toString(),
    vatRate: r.vatRateSnapshot?.toString() ?? null,
    // Il prezzo per unità non si fotografa: si ricava dal netto e dal
    // contenuto, che sono entrambi nella riga. Una copia in più sarebbe una
    // copia in più da tenere allineata.
    unitPrice: contenuto.gt(0) ? netto.div(contenuto).toDecimalPlaces(6).toString() : null,
    unitPriceBasis: r.unitPriceBasisSnapshot as RigaOrdine['unitPriceBasis'],
    quantityPacks: r.quantityPacks,
    lineTotalNet: r.lineTotalNet.toString(),
    lineTotalGross: r.lineTotalGross.toString(),
    position: r.position,
    note: r.note,
    migliorAlternativa: (r.bestAlternativeSnapshot as RigaOrdine['migliorAlternativa']) ?? null,
    // L'avviso si calcola dopo, quando si conoscono le offerte vive: qui la
    // riga non sa ancora cosa fanno gli altri fornitori.
    avviso: null,
    avvisoIgnorato: r.overrideReason !== null,
  };
}

/** L'etichetta con cui si registra «non avvisarmi più per questa riga». */
const AVVISO_IGNORATO = 'avviso ignorato dall’operatore';

/** I totali si ricalcolano **sempre** dalle righe, mai a incrementi. */
async function ricalcolaTotali(tx: OrganizationPrismaClient, orderId: string): Promise<void> {
  const ordine = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      lines: {
        select: { quantityPacks: true, unitPriceNetSnapshot: true, vatRateSnapshot: true },
      },
    },
  });

  const t = totaliOrdine(
    ordine.lines.map((l) => ({
      prezzoConfezione: l.unitPriceNetSnapshot.toString(),
      confezioni: l.quantityPacks,
      aliquotaIva: l.vatRateSnapshot?.toString() ?? null,
    })),
  );

  await tx.order.update({
    where: { id: orderId },
    data: {
      totalNet: t.netto.toString(),
      totalVat: t.iva.toString(),
      totalGross: t.lordo.toString(),
    },
  });
}

export function ordersRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);
  const confronti = comparisonRepository(organizationId);

  /** Le soglie dell'avviso, lette una volta per richiesta. */
  async function contesto() {
    return {
      impostazioni: valoriDaRighe(
        await settingsRepository(organizationId).findMany(SETTINGS_ALL_KEYS),
      ),
    };
  }

  /**
   * La bozza dell'utente, creata se non c'è.
   *
   * Dentro una transazione Serializable: due schede aperte devono trovare la
   * stessa bozza, non una a testa.
   */
  async function idBozza(userId: string): Promise<string> {
    // Il caso normale è che la bozza ci sia già: una lettura secca, senza
    // transazione. Aprirne una a ogni richiesta metterebbe in fila tutto il
    // traffico della schermata per un caso che capita una volta al giorno.
    const gia = await db.order.findFirst({
      where: { status: 'DRAFT', createdById: userId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (gia) return gia.id;

    // Serializable **solo qui**: è il caso del fantasma, due richieste che non
    // trovano niente e creano entrambe. PostgreSQL ne aborta una, il retry
    // rilegge e trova quella dell'altra.
    return transactionForOrganization(organizationId, async (tx) => {
      const esistente = await tx.order.findFirst({
        where: { status: 'DRAFT', createdById: userId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (esistente) return esistente.id;

      const creato = await tx.order.create({
        data: { organizationId, status: 'DRAFT', createdById: userId },
        select: { id: true },
      });
      return creato.id;
    });
  }

  /**
   * Ogni modifica dell'ordine comincia prendendo il lock sulla sua riga.
   *
   * È l'aggiornamento a vuoto in cima: sembra inutile e non lo è. Da lì in
   * poi questa transazione è sola sull'ordine, quindi può leggere le righe,
   * decidere e riscrivere il totale senza che nessuno le cambi sotto. Senza,
   * due aggiunte simultanee leggerebbero entrambe «riga non presente» e una
   * si perderebbe — o peggio, il totale finirebbe scritto da chi ha letto per
   * primo e non ha visto la riga dell'altro.
   */
  async function conOrdineBloccato<T>(
    orderId: string,
    operazione: (tx: OrganizationPrismaClient) => Promise<T>,
  ): Promise<T> {
    return transactionForOrganization(
      organizationId,
      async (tx) => {
        // Deve essere una scrittura **vera**: con `data: {}` Prisma non emette
        // nessuna UPDATE, quindi non prende nessun lock, e le aggiunte
        // simultanee si scontrano sul vincolo di unicità invece di mettersi in
        // fila. Toccare `updatedAt` è anche corretto nel merito: l'ordine sta
        // per cambiare.
        await tx.order.update({ where: { id: orderId }, data: { updatedAt: new Date() } });
        return operazione(tx);
      },
      { isolamento: 'riga-bloccata' },
    );
  }

  async function leggi(orderId: string): Promise<OrdineCorrente> {
    const ordine = await db.order.findFirstOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        note: true,
        updatedAt: true,
        lines: { select: RIGA_SELECT, orderBy: { position: 'asc' } },
      },
    });

    const righe = (ordine.lines as unknown as RigaRecord[]).map(mapRiga);

    // ── L'avviso «lo trovi a meno da un altro» ────────────────────────
    //
    // Si calcola **adesso** sulle offerte vive, non dallo snapshot della
    // riga: i prezzi cambiano, e un avviso vecchio di un mese consiglierebbe
    // un fornitore che nel frattempo è diventato il più caro.
    const { impostazioni } = await contesto();
    const soglie = {
      percentuale: impostazioni.alertPercentage,
      euro: impostazioni.alertEuro,
    };
    const prodottiInOrdine = [...new Set(righe.map((r) => r.productId).filter((id): id is string => id !== null))];
    const confronti = await comparisonRepository(organizationId).perProdotti(prodottiInOrdine);

    let risparmioPotenziale = new Decimal(0);
    let righeConAvviso = 0;

    for (const riga of righe) {
      if (!riga.productId) continue;
      const confronto = confronti.get(riga.productId);
      if (!confronto) continue;

      const perAvviso = (o: (typeof confronto.ranked)[number]): OffertaPerAvviso => ({
        supplierProductId: o.supplierProductId,
        supplierName: o.supplierName,
        prezzoConfezione: o.priceNet,
        contenutoPerConfezione: o.contentPerPack,
        pezziPerConfezione: o.packQuantity,
      });

      const scelta = confronto.ranked.find((o) => o.supplierProductId === riga.supplierProductId);
      if (!scelta) continue;

      const esito = confrontaPerAvviso(
        perAvviso(scelta),
        confronto.ranked.map(perAvviso),
        riga.quantityPacks,
        soglie,
      );
      if (!esito) continue;

      const migliore = confronto.ranked.find(
        (o) => o.supplierProductId === esito.migliore.supplierProductId,
      )!;
      const cambio = calcolaCambio(perAvviso(scelta), perAvviso(migliore), riga.quantityPacks);

      riga.avviso = {
        risparmioPerConfezione: esito.risparmioPerConfezione.toString(),
        risparmioPct: esito.risparmioPct.toString(),
        risparmioTotale: esito.risparmioTotale.toString(),
        meritaAvviso: esito.meritaAvviso,
        migliore: {
          supplierProductId: migliore.supplierProductId,
          supplierName: migliore.supplierName,
          priceNet: migliore.priceNet,
          packQuantity: migliore.packQuantity,
        },
        cambio: {
          confezioni: cambio.confezioni,
          pezziPrima: cambio.pezziPrima,
          pezziDopo: cambio.pezziDopo,
          esatto: cambio.esatto,
          descrizione: cambio.descrizione,
          spesaPrima: cambio.spesaPrima.toString(),
          spesaDopo: cambio.spesaDopo.toString(),
          risparmio: cambio.risparmio.toString(),
        },
      };

      // Il risparmio complessivo conta **solo** ciò che è oltre soglia e non
      // messo a tacere: sommare anche i centesimi darebbe un totale che nessuno
      // andrà mai a incassare.
      if (esito.meritaAvviso && !riga.avvisoIgnorato) {
        righeConAvviso += 1;
        risparmioPotenziale = risparmioPotenziale.plus(esito.risparmioTotale);
      }
    }

    const t = totaliOrdine(
      righe.map((r) => ({
        prezzoConfezione: r.priceNet,
        confezioni: r.quantityPacks,
        aliquotaIva: r.vatRate,
      })),
    );

    // Raggruppate per fornitore perché è così che l'ordine partirà: un
    // totale unico non dice a nessuno quanto si sta ordinando da chi.
    const gruppi = new Map<string, { supplierName: string; righe: number; confezioni: number; netto: Decimal }>();
    for (const riga of righe) {
      const g = gruppi.get(riga.supplierId) ?? {
        supplierName: riga.supplierName,
        righe: 0,
        confezioni: 0,
        netto: new Decimal(0),
      };
      g.righe += 1;
      g.confezioni += riga.quantityPacks;
      g.netto = g.netto.plus(riga.lineTotalNet);
      gruppi.set(riga.supplierId, g);
    }

    return {
      id: ordine.id,
      status: ordine.status,
      note: ordine.note,
      righe,
      totali: {
        righe: t.righe,
        confezioni: t.confezioni,
        netto: t.netto.toString(),
        iva: t.iva.toString(),
        lordo: t.lordo.toString(),
        risparmioPotenziale: risparmioPotenziale.toDecimalPlaces(2).toString(),
        righeConAvviso,
      },
      perFornitore: [...gruppi.entries()]
        .map(([supplierId, g]) => ({
          supplierId,
          supplierName: g.supplierName,
          righe: g.righe,
          confezioni: g.confezioni,
          netto: g.netto.toString(),
        }))
        .sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'it')),
      updatedAt: ordine.updatedAt.toISOString(),
    };
  }

  return {
    async corrente(userId: string): Promise<OrdineCorrente> {
      return leggi(await idBozza(userId));
    },

    /**
     * Cerca nel catalogo e porta con sé cosa si può ordinare.
     *
     * La ricerca trova prodotti, ma si ordina da un fornitore: ogni risultato
     * porta le sue offerte, ordinate dalla più conveniente, con la stessa
     * regola di dominio del confronto. Un prodotto senza prezzo corrente
     * **resta in elenco** con scritto perché non si può aggiungere: farlo
     * sparire farebbe cercare ancora.
     */
    async cerca(userId: string, query: RicercaOrdinabile): Promise<RisultatoOrdinabile[]> {
      // Senza termine si mostra il catalogo in ordine alfabetico: è l'elenco
      // da cui si ordina scorrendo, e deve esserci già all'apertura.
      const trovati = query.q
        ? (await productsRepository(organizationId).search({ q: query.q, limite: query.limite }))
            .items
        : ((await db.product.findMany({
            where: { supplierProducts: { some: { active: true, currentPriceId: { not: null } } } },
            select: {
              id: true,
              name: true,
              brand: true,
              unitSize: true,
              unitOfMeasure: true,
              category: { select: CATEGORY_REF_SELECT },
            },
            orderBy: { name: 'asc' },
            take: query.limite,
          })) as unknown as {
            id: string;
            name: string;
            brand: string | null;
            unitSize: { toString(): string };
            unitOfMeasure: string;
            category: Parameters<typeof mapCategoryRef>[0];
          }[]).map((p) => ({
            id: p.id,
            name: p.name,
            brand: p.brand,
            unitSize: p.unitSize.toString(),
            unitOfMeasure: p.unitOfMeasure as RisultatoOrdinabile['unitOfMeasure'],
            category: mapCategoryRef(p.category),
          }));

      if (trovati.length === 0) return [];
      const esito = { items: trovati };

      const ids = esito.items.map((i) => i.id);
      const [mappa, ordine] = await Promise.all([
        confronti.perProdotti(ids),
        leggi(await idBozza(userId)),
      ]);

      const nellOrdine = new Map<string, number>();
      for (const riga of ordine.righe) {
        if (riga.productId) {
          nellOrdine.set(riga.productId, (nellOrdine.get(riga.productId) ?? 0) + riga.quantityPacks);
        }
      }

      const risultati: RisultatoOrdinabile[] = [];
      for (const hit of esito.items) {
        const confronto = mappa.get(hit.id);
        if (!confronto) continue;

        const offerte: OffertaOrdinabile[] = confronto.ranked.map((o, indice) => ({
          supplierProductId: o.supplierProductId,
          supplierId: o.supplierId,
          supplierName: o.supplierName,
          supplierCode: o.supplierCode,
          rawName: o.rawName,
          priceNet: o.priceNet,
          unitPrice: o.unitPrice,
          unitPriceBasis: o.unitPriceBasis,
          vatRate: o.vatRate,
          packQuantity: o.packQuantity,
          packagingType: o.packagingType,
          unitSize: o.unitSize,
          unitOfMeasure: o.unitOfMeasure,
          baseUnit: o.baseUnit,
          // «Il più conveniente» solo se un confronto c'è stato davvero: con
          // un fornitore solo non c'è stata nessuna scelta.
          migliore: indice === 0 && confronto.state === 'CONFRONTATO',
          stale: o.stale,
        }));

        if (query.soloConfrontabili && confronto.state !== 'CONFRONTATO') continue;
        if (query.supplierId && !offerte.some((o) => o.supplierId === query.supplierId)) continue;
        if (query.categoryId && hit.category?.id !== query.categoryId) continue;
        if (query.departmentId && hit.category?.departmentId !== query.departmentId) continue;

        risultati.push({
          productId: hit.id,
          name: hit.name,
          brand: hit.brand,
          category: hit.category,
          unitSize: hit.unitSize,
          unitOfMeasure: hit.unitOfMeasure,
          offerte,
          nonOrdinabile: offerte.length === 0 ? (confronto.reason ?? 'Nessun prezzo corrente.') : null,
          confrontato: confronto.state === 'CONFRONTATO',
          risparmioPerConfezione: confronto.savingPerPack,
          giaNellOrdine: nellOrdine.get(hit.id) ?? 0,
        });
      }

      return risultati;
    },

    /**
     * Aggiunge un'offerta all'ordine, o ne aumenta la quantità.
     *
     * Aggiungere due volte la stessa offerta **non crea due righe**: il
     * vincolo di unicità lo impedirebbe comunque, ma qui la seconda aggiunta
     * diventa un aumento di quantità, che è quello che una persona intende
     * quando ricerca lo stesso articolo e lo aggiunge di nuovo.
     */
    async aggiungiRiga(userId: string, input: RigaOrdineInput): Promise<OrdineCorrente> {
      const orderId = await idBozza(userId);

      const offerta = await db.supplierProduct.findFirst({
        where: { id: input.supplierProductId },
        select: {
          id: true,
          supplierId: true,
          productId: true,
          supplierCode: true,
          rawName: true,
          packQuantity: true,
          unitSize: true,
          unitOfMeasure: true,
          vatRate: true,
          active: true,
          supplier: { select: { name: true } },
          product: { select: { name: true } },
          currentPrice: {
            select: { id: true, priceNet: true, vatRate: true, unitPriceBasis: true },
          },
        },
      });
      if (!offerta) throw new OrderNotFoundError('L’offerta indicata non esiste.');

      // Un prodotto senza prezzo corrente non è ordinabile: si finirebbe con
      // una riga il cui totale è zero e nessuno saprebbe quanto costa.
      if (!offerta.currentPrice) {
        throw new OrderValidationError(
          'Questa offerta non ha un prezzo corrente: non si può ordinare finché non se ne registra uno.',
        );
      }
      if (!offerta.active) {
        throw new OrderValidationError(
          'Questa offerta non è più a listino: il fornitore non la vende più.',
        );
      }

      const confronto = offerta.productId
        ? await confronti.perProdotto(offerta.productId)
        : null;
      const migliore = confronto?.best ?? null;
      // Si registra l'alternativa **solo se è diversa** da ciò che si sta
      // ordinando: annotare «la migliore era questa stessa» riempirebbe le
      // righe di rumore e renderebbe illeggibili quelle che contano.
      const alternativa =
        migliore && migliore.supplierProductId !== offerta.id
          ? {
              supplierProductId: migliore.supplierProductId,
              supplierName: migliore.supplierName,
              priceNet: migliore.priceNet,
              unitPrice: migliore.unitPrice,
              risparmioPerConfezione: confronto?.savingPerPack ?? null,
            }
          : null;

      const aliquota = offerta.currentPrice.vatRate ?? offerta.vatRate;
      const netto = offerta.currentPrice.priceNet.toString();

      await conOrdineBloccato(orderId, async (tx) => {
        const esistente = await tx.order.findFirstOrThrow({
          where: { id: orderId },
          select: {
            lines: {
              where: { supplierProductId: offerta.id },
              select: { id: true, quantityPacks: true },
            },
            _count: { select: { lines: true } },
          },
        });

        const riga = esistente.lines[0];
        const quantita = (riga?.quantityPacks ?? 0) + input.quantityPacks;
        const t = totaliRiga({
          prezzoConfezione: netto,
          confezioni: quantita,
          aliquotaIva: aliquota?.toString() ?? null,
        });

        if (riga) {
          await tx.order.update({
            where: { id: orderId },
            data: {
              lines: {
                update: {
                  where: { id: riga.id },
                  data: {
                    quantityPacks: quantita,
                    lineTotalNet: t.netto.toString(),
                    lineTotalGross: t.lordo.toString(),
                  },
                },
              },
            },
          });
        } else {
          await tx.order.update({
            where: { id: orderId },
            data: {
              lines: {
                create: {
                  supplierProductId: offerta.id,
                  productId: offerta.productId,
                  supplierId: offerta.supplierId,
                  priceId: offerta.currentPrice!.id,
                  quantityPacks: quantita,
                  nameSnapshot: offerta.product?.name ?? offerta.rawName,
                  supplierNameSnapshot: offerta.supplier.name,
                  supplierCodeSnapshot: offerta.supplierCode,
                  packQuantitySnapshot: offerta.packQuantity,
                  unitSizeSnapshot: offerta.unitSize,
                  uomSnapshot: offerta.unitOfMeasure,
                  unitPriceNetSnapshot: netto,
                  vatRateSnapshot: aliquota,
                  unitPriceBasisSnapshot: offerta.currentPrice!.unitPriceBasis,
                  lineTotalNet: t.netto.toString(),
                  lineTotalGross: t.lordo.toString(),
                  bestAlternativeSnapshot: alternativa ?? undefined,
                  position: esistente._count.lines,
                  note: input.note ?? null,
                },
              },
            },
          });
        }

        await ricalcolaTotali(tx, orderId);
      });

      return leggi(orderId);
    },

    async aggiornaRiga(
      userId: string,
      rigaId: string,
      patch: RigaOrdinePatch,
    ): Promise<OrdineCorrente> {
      const orderId = await idBozza(userId);

      await conOrdineBloccato(orderId, async (tx) => {
        const ordine = await tx.order.findFirstOrThrow({
          where: { id: orderId },
          select: {
            lines: {
              where: { id: rigaId },
              select: {
                id: true,
                quantityPacks: true,
                unitPriceNetSnapshot: true,
                vatRateSnapshot: true,
              },
            },
          },
        });
        const riga = ordine.lines[0];
        if (!riga) throw new OrderNotFoundError('Riga non trovata in questo ordine.');

        const quantita = patch.quantityPacks ?? riga.quantityPacks;
        const t = totaliRiga({
          prezzoConfezione: riga.unitPriceNetSnapshot.toString(),
          confezioni: quantita,
          aliquotaIva: riga.vatRateSnapshot?.toString() ?? null,
        });

        await tx.order.update({
          where: { id: orderId },
          data: {
            lines: {
              update: {
                where: { id: rigaId },
                data: {
                  quantityPacks: quantita,
                  lineTotalNet: t.netto.toString(),
                  lineTotalGross: t.lordo.toString(),
                  ...(patch.note !== undefined ? { note: patch.note ?? null } : {}),
                  ...(patch.ignoraAvviso !== undefined
                    ? { overrideReason: patch.ignoraAvviso ? AVVISO_IGNORATO : null }
                    : {}),
                },
              },
            },
          },
        });

        await ricalcolaTotali(tx, orderId);
      });

      return leggi(orderId);
    },

    /**
     * Passa una riga all'altro fornitore, ricalcolando le confezioni.
     *
     * Quattro colli da 12 non sono quattro colli da 24: sono due. Il ricalcolo
     * si fa qui, con la stessa funzione che l'avviso usa per **mostrare** il
     * conto — così quello che si vede prima di premere è esattamente quello
     * che succede dopo.
     *
     * La riga vecchia sparisce e ne nasce una nuova: è un altro articolo di un
     * altro fornitore, con un altro codice e un altro prezzo. Modificare
     * quella esistente lascerebbe uno snapshot che non corrisponde a niente.
     */
    async cambiaFornitore(
      userId: string,
      rigaId: string,
      nuovoSupplierProductId: string,
    ): Promise<OrdineCorrente> {
      const orderId = await idBozza(userId);
      const attuale = await leggi(orderId);
      const riga = attuale.righe.find((r) => r.id === rigaId);
      if (!riga) throw new OrderNotFoundError('Riga non trovata in questo ordine.');
      if (riga.supplierProductId === nuovoSupplierProductId) {
        throw new OrderValidationError('È già questo il fornitore della riga.');
      }

      // Si leggono **entrambe** le offerte: il contenuto per confezione è il
      // numero su cui gira tutto il ricalcolo, e ricavarlo dividendo il netto
      // per il prezzo unitario sarebbe fragile — basta un prezzo unitario
      // mancante e il conto salta senza dirlo.
      const offerte = await db.supplierProduct.findMany({
        where: { id: { in: [riga.supplierProductId, nuovoSupplierProductId] } },
        select: {
          id: true,
          packQuantity: true,
          contentPerPack: true,
          active: true,
          currentPrice: { select: { priceNet: true } },
        },
      });
      const vecchia = offerte.find((o) => o.id === riga.supplierProductId);
      const nuova = offerte.find((o) => o.id === nuovoSupplierProductId);
      if (!nuova || !vecchia) throw new OrderNotFoundError('L’offerta indicata non esiste.');
      if (!nuova.currentPrice || !nuova.active) {
        throw new OrderValidationError(
          'Quell’offerta non ha un prezzo corrente o non è più a listino.',
        );
      }

      const cambio = calcolaCambio(
        {
          supplierProductId: vecchia.id,
          supplierName: riga.supplierName,
          prezzoConfezione: riga.priceNet,
          contenutoPerConfezione: vecchia.contentPerPack.toString(),
          pezziPerConfezione: vecchia.packQuantity,
        },
        {
          supplierProductId: nuova.id,
          supplierName: '',
          prezzoConfezione: nuova.currentPrice.priceNet.toString(),
          contenutoPerConfezione: nuova.contentPerPack.toString(),
          pezziPerConfezione: nuova.packQuantity,
        },
        riga.quantityPacks,
      );

      await this.rimuoviRiga(userId, rigaId);
      return this.aggiungiRiga(userId, {
        supplierProductId: nuovoSupplierProductId,
        quantityPacks: cambio.confezioni,
      });
    },

    async rimuoviRiga(userId: string, rigaId: string): Promise<OrdineCorrente> {
      const orderId = await idBozza(userId);

      await conOrdineBloccato(orderId, async (tx) => {
        const ordine = await tx.order.findFirstOrThrow({
          where: { id: orderId },
          select: { lines: { where: { id: rigaId }, select: { id: true } } },
        });
        if (ordine.lines.length === 0) {
          throw new OrderNotFoundError('Riga non trovata in questo ordine.');
        }
        await tx.order.update({
          where: { id: orderId },
          data: { lines: { delete: { id: rigaId } } },
        });
        await ricalcolaTotali(tx, orderId);
      });

      return leggi(orderId);
    },

    async svuota(userId: string): Promise<OrdineCorrente> {
      const orderId = await idBozza(userId);
      await conOrdineBloccato(orderId, async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { lines: { deleteMany: {} } },
        });
        await ricalcolaTotali(tx, orderId);
      });
      return leggi(orderId);
    },
  };
}
