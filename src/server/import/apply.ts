import 'server-only';

import { Decimal } from 'decimal.js';
import { transactionForOrganization, type OrganizationPrismaClient } from '@/server/db';
import { prismaForOrganization } from '@/server/db';
import { applicaPrezzoInTransazione } from '@/server/repositories/prices';
import { nucleoDescrizione } from '@/server/domain/packaging/parse';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';
import { baseDi, type UnitOfMeasure } from '@/server/domain/packaging/units';
import { improntaDaDescrizione } from '@/server/domain/packaging/fingerprint';
import { ricalcolaMiglioriOfferte } from './best-offer';
import {
  riconcilia,
  riepiloga,
  type Confronto,
  type OffertaACatalogo,
  type RigaDelFile,
  type RiepilogoImport,
} from './reconcile';

/**
 * Dallo staging al dominio, in **una sola transazione**.
 *
 * È la fase che protegge l'integrità di tutto il sistema, e il motivo per cui
 * l'import non scrive mai direttamente: fin qui tutto vive su
 * `price_list_row` e si può buttare via. Da qui in poi tocca prezzi e
 * catalogo — e se qualcosa va storto a metà, non deve restare metà.
 *
 * Cosa fa, nell'ordine:
 *
 *  1. crea i `supplier_product` nuovi, e il `product` canonico dove serve;
 *  2. per ogni prezzo cambiato chiude il precedente e ne apre uno nuovo;
 *  3. tocca `last_seen_at` su ciò che è invariato — «l'ho rivisto» è un dato;
 *  4. marca `active = false` ciò che dal listino è sparito;
 *  5. porta il listino ad `APPLIED`.
 *
 * Il ricalcolo della miglior offerta sta fuori dalla transazione, di
 * proposito: è un dato derivato, e se fallisse non deve poter annullare
 * l'import. Si ricalcola da capo, non si aggiorna a pezzi.
 */

export class ApplicazioneBloccataError extends Error {
  override readonly name = 'ApplicazioneBloccataError';
  constructor(
    message: string,
    readonly dettagli?: Record<string, unknown>,
  ) {
    super(message);
  }
}

interface CampiRiga {
  codice?: string | null;
  descrizione?: string | null;
  unitaDiVendita?: string | null;
  prezzoListino?: string | null;
  sconti?: number[];
  prezzoNetto?: string | null;
  iva?: string | null;
  unitSize?: string | null;
  unitOfMeasure?: string | null;
  packQuantity?: number;
  packQuantityConfirmed?: boolean;
  contentPerPack?: string | null;
  baseUnit?: string | null;
}

interface RigaCaricata {
  id: string;
  campi: CampiRiga;
  productId: string | null;
  supplierProductId: string | null;
  excluded: boolean;
  matchStatus: string;
}

export interface EsitoApplicazione extends RiepilogoImport {
  priceListId: string;
  creati: number;
  prezziScritti: number;
  disattivati: number;
  prodottiCreati: number;
}

/**
 * Carica ciò che serve alla riconciliazione, dentro il perimetro.
 *
 * Il perimetro è **fornitore + copertura**, e si ricava da quale listino ha
 * visto per ultimo ciascuna offerta. È la ragione per cui la copertura
 * esiste: senza, applicare i liquori farebbe risultare spariti tutti i vini.
 */
async function caricaPerimetro(
  db: OrganizationPrismaClient,
  supplierId: string,
  scopeLabel: string,
): Promise<OffertaACatalogo[]> {
  const offerte = await db.supplierProduct.findMany({
    where: {
      supplierId,
      OR: [
        { lastSeenPriceList: { scopeLabel } },
        // Le offerte mai viste da un listino di questa copertura non
        // appartengono al perimetro e non devono poter «sparire».
      ],
    },
    select: {
      id: true,
      supplierCode: true,
      packagingType: true,
      packQuantity: true,
      unitSize: true,
      unitOfMeasure: true,
      active: true,
      currentPrice: { select: { priceNet: true } },
    },
  });

  return offerte.map((o) => ({
    supplierProductId: o.id,
    supplierCode: o.supplierCode,
    unitaDiVendita: o.packagingType,
    packQuantity: o.packQuantity,
    unitSize: new Decimal(o.unitSize.toString()),
    unitOfMeasure: o.unitOfMeasure,
    prezzoNetto: o.currentPrice ? new Decimal(o.currentPrice.priceNet.toString()) : null,
    active: o.active,
  }));
}

function rigaDelFile(riga: RigaCaricata): RigaDelFile | null {
  const c = riga.campi;
  if (!c.descrizione) return null;
  return {
    chiave: riga.id,
    supplierCode: c.codice ?? null,
    unitaDiVendita: c.unitaDiVendita ?? null,
    packQuantity: c.packQuantity ?? 1,
    unitSize: new Decimal(c.unitSize ?? '1'),
    unitOfMeasure: c.unitOfMeasure ?? 'PIECE',
    prezzoNetto: c.prezzoNetto ? new Decimal(c.prezzoNetto) : null,
    inclusa: !riga.excluded,
  };
}

/**
 * Calcola cosa succederebbe applicando, **senza applicare**.
 *
 * È ciò che la schermata di revisione mostra prima di chiedere conferma: i
 * conteggi, le variazioni anomale, i casi in cui la confezione è cambiata.
 */
export async function anteprima(
  organizationId: string,
  priceListId: string,
): Promise<{ confronti: Confronto[]; riepilogo: RiepilogoImport; righe: Map<string, RigaCaricata> }> {
  const db = prismaForOrganization(organizationId);
  const listino = await db.priceList.findFirst({
    where: { id: priceListId },
    select: {
      id: true,
      supplierId: true,
      scopeLabel: true,
      rows: {
        select: {
          id: true,
          extracted: true,
          productId: true,
          supplierProductId: true,
          excluded: true,
          matchStatus: true,
        },
        orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }],
      },
    },
  });
  if (!listino) throw new ApplicazioneBloccataError('Listino non trovato.');

  const righe = new Map<string, RigaCaricata>();
  const nelFile: RigaDelFile[] = [];
  for (const r of listino.rows) {
    const e = (r.extracted ?? {}) as { tipo?: string; campi?: CampiRiga };
    if (e.tipo !== 'prodotto' || !e.campi) continue;
    const caricata: RigaCaricata = {
      id: r.id,
      campi: e.campi,
      productId: r.productId,
      supplierProductId: r.supplierProductId,
      excluded: r.excluded,
      matchStatus: r.matchStatus,
    };
    righe.set(r.id, caricata);
    const riga = rigaDelFile(caricata);
    if (riga) nelFile.push(riga);
  }

  const aCatalogo = await caricaPerimetro(db, listino.supplierId, listino.scopeLabel);
  const confronti = riconcilia(aCatalogo, nelFile);
  return { confronti, riepilogo: riepiloga(confronti), righe };
}

/**
 * Applica l'import.
 *
 * Si rifiuta di partire se restano casi che una persona deve decidere: una
 * confezione cambiata applicata in automatico è esattamente l'errore che
 * questa fase esiste per impedire.
 */
export async function applicaImport(
  organizationId: string,
  priceListId: string,
  userId: string,
): Promise<EsitoApplicazione> {
  const db = prismaForOrganization(organizationId);
  const listino = await db.priceList.findFirst({
    where: { id: priceListId },
    select: { id: true, status: true, supplierId: true, scopeLabel: true, currency: true },
  });
  if (!listino) throw new ApplicazioneBloccataError('Listino non trovato.');
  if (listino.status === 'APPLIED') {
    throw new ApplicazioneBloccataError('Questo listino è già stato applicato.');
  }

  const { confronti, righe } = await anteprima(organizationId, priceListId);

  const daDecidere = confronti.filter((c) => c.esito === 'CONFEZIONE_CAMBIATA');
  if (daDecidere.length > 0) {
    throw new ApplicazioneBloccataError(
      `${daDecidere.length} ${daDecidere.length === 1 ? 'riga ha' : 'righe hanno'} la confezione ` +
        'cambiata rispetto al listino precedente. Vanno decise prima di applicare: applicarle in ' +
        'automatico farebbe sembrare un cambio di prezzo quello che è un cambio di confezione.',
      { righe: daDecidere.map((c) => c.chiaveRiga) },
    );
  }

  let creati = 0;
  let prezziScritti = 0;
  let disattivati = 0;
  let prodottiCreati = 0;

  await transactionForOrganization(organizationId, async (tx) => {
    for (const confronto of confronti) {
      if (confronto.esito === 'SPARITO') {
        // Mai cancellato: si perderebbero storico e ordini passati.
        await tx.supplierProduct.update({
          where: { id: confronto.supplierProductId! },
          data: { active: false, disappearedAt: new Date() },
        });
        disattivati += 1;
        continue;
      }

      // Una riga duplicata nello stesso file non si crea due volte: sarebbe
      // la stessa offerta dello stesso fornitore, e le due si
      // confronterebbero fra loro.
      if (confronto.esito === 'DUPLICATO') continue;

      const riga = righe.get(confronto.chiaveRiga!);
      if (!riga) continue;
      const c = riga.campi;

      let supplierProductId = confronto.supplierProductId;

      if (confronto.esito === 'NUOVO') {
        // Il prodotto canonico: quello proposto dall'abbinamento se c'è,
        // altrimenti se ne crea uno nuovo.
        let productId = riga.productId;
        if (!productId) {
          const nucleo = nucleoDescrizione(c.descrizione!) || normalizzaTesto(c.descrizione!);
          const creato = await tx.product.create({
            data: {
              organizationId,
              name: c.descrizione!.slice(0, 200),
              unitSize: c.unitSize ?? '1',
              unitOfMeasure: (c.unitOfMeasure ?? 'PIECE') as UnitOfMeasure,
              baseUnit: baseDi((c.unitOfMeasure ?? 'PIECE') as UnitOfMeasure),
              normalizedName: nucleo || 'senza nome',
              createdBy: 'IMPORT',
            },
            select: { id: true },
          });
          productId = creato.id;
          prodottiCreati += 1;
        }

        const offerta = await tx.supplierProduct.create({
          data: {
            organizationId,
            supplierId: listino.supplierId,
            productId,
            supplierCode: c.codice ?? null,
            rawName: c.descrizione!.slice(0, 300),
            normalizedName: nucleoDescrizione(c.descrizione!) || 'senza nome',
            packagingType: c.unitaDiVendita ?? null,
            packQuantity: c.packQuantity ?? 1,
            packQuantityConfirmed: c.packQuantityConfirmed ?? false,
            unitSize: c.unitSize ?? '1',
            unitOfMeasure: (c.unitOfMeasure ?? 'PIECE') as UnitOfMeasure,
            contentPerPack: c.contentPerPack ?? '1',
            baseUnit: baseDi((c.unitOfMeasure ?? 'PIECE') as UnitOfMeasure),
            vatRate: c.iva ?? null,
            fingerprint: improntaDaDescrizione(c.descrizione!, {
              unitaDiVendita: c.unitaDiVendita,
            }),
            matchStatus: riga.matchStatus === 'CONFIRMED' ? 'CONFIRMED' : 'AUTO',
            lastSeenPriceListId: priceListId,
          },
          select: { id: true },
        });
        supplierProductId = offerta.id;
        creati += 1;
      }

      if (!supplierProductId) continue;

      // «L'ho rivisto in questo listino» è un dato, e serve alla prossima
      // riconciliazione per sapere cosa appartiene al perimetro.
      await tx.supplierProduct.update({
        where: { id: supplierProductId },
        data: {
          lastSeenAt: new Date(),
          lastSeenPriceListId: priceListId,
          active: true,
          disappearedAt: null,
        },
      });

      // Prezzo invariato: nessuna riga nuova nello storico.
      if (confronto.esito === 'INVARIATO') continue;
      if (!c.prezzoListino && !c.prezzoNetto) continue;

      await applicaPrezzoInTransazione(
        tx,
        supplierProductId,
        {
          priceList: c.prezzoListino ?? c.prezzoNetto!,
          discounts: c.sconti ?? [],
          // Il netto **dichiarato dal documento** vince sul ricalcolo: è
          // quello che si paga, anche quando il fornitore ha arrotondato a
          // modo suo.
          priceNet: c.prezzoNetto ?? undefined,
          vatRate: c.iva ?? undefined,
          validFrom: oggi(),
          source: 'PRICE_LIST',
          priceListId,
        },
        userId,
      );
      prezziScritti += 1;

      await tx.priceList.update({
        where: { id: priceListId },
        data: { rows: { update: { where: { id: riga.id }, data: { supplierProductId } } } },
      });
    }

    await tx.priceList.update({
      where: { id: priceListId },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });
  });

  // Fuori dalla transazione: e' un dato derivato, e se fallisse non deve
  // poter annullare un import corretto. Il peggio che capita e' una miglior
  // offerta vecchia di qualche minuto.
  try {
    await ricalcolaMiglioriOfferte(organizationId);
  } catch (errore) {
    console.error(`Ricalcolo delle migliori offerte dopo l'import ${priceListId} fallito:`, errore);
  }

  return {
    priceListId,
    ...riepiloga(confronti),
    creati,
    prezziScritti,
    disattivati,
    prodottiCreati,
  };
}

/** Il giorno civile della gelateria, come lo intende lo storico prezzi. */
function oggi(): string {
  const parti = new Intl.DateTimeFormat('it-IT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Rome',
  }).formatToParts(new Date());
  const p = (tipo: string) => parti.find((x) => x.type === tipo)?.value ?? '';
  return `${p('year')}-${p('month')}-${p('day')}`;
}

/**
 * Annulla un import applicato.
 *
 * Il criterio è severo e giusto: il database deve tornare **esattamente** allo
 * stato precedente. Non «più o meno», non «i prezzi sì e il resto pazienza».
 *
 * Tre operazioni, e la seconda è quella in cui è facile sbagliare:
 *
 *  1. si tolgono i prezzi scritti da questo listino;
 *  2. si **riaprono** quelli che avevano chiuso — un prezzo che era corrente
 *     e a cui l'import ha messo una data di fine deve tornare senza data di
 *     fine, altrimenti l'offerta resta senza prezzo corrente e il confronto
 *     fra fornitori la salta in silenzio;
 *  3. si cancellano le offerte e i prodotti creati **da questo import e da
 *     nessun altro**, e si riattiva ciò che era stato disattivato.
 *
 * Un'offerta che ha già ricevuto prezzi da un altro listino non si cancella:
 * si porterebbe via storico che non appartiene a questo import.
 */
export interface EsitoAnnullamento {
  prezziRimossi: number;
  prezziRiaperti: number;
  offerteRimosse: number;
  prodottiRimossi: number;
  offerteRiattivate: number;
}

export async function annullaImport(
  organizationId: string,
  priceListId: string,
): Promise<EsitoAnnullamento> {
  const db = prismaForOrganization(organizationId);
  const listino = await db.priceList.findFirst({
    where: { id: priceListId },
    select: { id: true, status: true },
  });
  if (!listino) throw new ApplicazioneBloccataError('Listino non trovato.');
  if (listino.status !== 'APPLIED') {
    throw new ApplicazioneBloccataError('Questo listino non è stato applicato: non c’è nulla da annullare.');
  }

  const esito: EsitoAnnullamento = {
    prezziRimossi: 0,
    prezziRiaperti: 0,
    offerteRimosse: 0,
    prodottiRimossi: 0,
    offerteRiattivate: 0,
  };

  await transactionForOrganization(organizationId, async (tx) => {
    const listinoConPrezzi = await tx.priceList.findFirstOrThrow({
      where: { id: priceListId },
      select: {
        prices: {
          select: { id: true, supplierProductId: true, validFrom: true },
          orderBy: { validFrom: 'asc' },
        },
      },
    });

    const offerteToccate = new Set(listinoConPrezzi.prices.map((p) => p.supplierProductId));

    for (const offertaId of offerteToccate) {
      const storico = await tx.supplierProduct.findFirstOrThrow({
        where: { id: offertaId },
        select: {
          id: true,
          prices: {
            select: { id: true, validFrom: true, validTo: true, priceListId: true },
            orderBy: [{ validFrom: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      const daTogliere = storico.prices.filter((p) => p.priceListId === priceListId);
      const restanti = storico.prices.filter((p) => p.priceListId !== priceListId);

      // Il puntatore al prezzo corrente va sciolto prima di cancellare, o la
      // chiave esterna blocca la rimozione.
      await tx.supplierProduct.update({ where: { id: offertaId }, data: { currentPriceId: null } });

      for (const prezzo of daTogliere) {
        await tx.supplierProduct.update({
          where: { id: offertaId },
          data: { prices: { delete: { id: prezzo.id } } },
        });
        esito.prezziRimossi += 1;
      }

      // Riapertura: l'ultimo prezzo rimasto torna a essere quello corrente,
      // senza data di fine. È il passo che, se saltato, lascia l'offerta
      // senza prezzo corrente — e il confronto fra fornitori la salta in
      // silenzio, che è il modo peggiore di rompersi.
      const ultimo = restanti.at(-1);
      if (ultimo) {
        if (ultimo.validTo !== null) {
          await tx.supplierProduct.update({
            where: { id: offertaId },
            data: { prices: { update: { where: { id: ultimo.id }, data: { validTo: null } } } },
          });
          esito.prezziRiaperti += 1;
        }
        await tx.supplierProduct.update({
          where: { id: offertaId },
          data: { currentPriceId: ultimo.id },
        });
      }
    }

    // Le offerte create da questo import: si riconoscono perché è l'unico
    // listino che le ha viste e non hanno più prezzi addosso.
    const create = await tx.supplierProduct.findMany({
      where: { lastSeenPriceListId: priceListId },
      select: { id: true, productId: true, _count: { select: { prices: true } } },
    });

    for (const offerta of create) {
      if (offerta._count.prices > 0) continue;
      await tx.supplierProduct.delete({ where: { id: offerta.id } });
      esito.offerteRimosse += 1;

      // Il prodotto canonico si porta via solo se resta senza offerte: se
      // un'altra offerta ci punta, appartiene anche a lei.
      if (offerta.productId) {
        const rimaste = await tx.supplierProduct.count({ where: { productId: offerta.productId } });
        if (rimaste === 0) {
          await tx.product
            .delete({ where: { id: offerta.productId } })
            .then(() => {
              esito.prodottiRimossi += 1;
            })
            .catch(() => {
              // Se qualcosa ci punta ancora (un ordine, un alias), resta.
            });
        }
      }
    }

    // Ciò che questo import aveva dichiarato sparito torna attivo.
    const riattivate = await tx.supplierProduct.updateMany({
      where: { lastSeenPriceList: { id: priceListId }, active: false },
      data: { active: true, disappearedAt: null },
    });
    esito.offerteRiattivate = riattivate.count;

    await tx.priceList.update({
      where: { id: priceListId },
      data: { status: 'REVERTED', revertedAt: new Date(), appliedAt: null },
    });
  });

  // Anche qui fuori dalla transazione, e per lo stesso motivo: dopo un
  // annullamento le migliori offerte sono quelle di prima, e vanno rifatte.
  try {
    await ricalcolaMiglioriOfferte(organizationId);
  } catch (errore) {
    console.error(`Ricalcolo delle migliori offerte dopo l'annullamento fallito:`, errore);
  }

  return esito;
}
