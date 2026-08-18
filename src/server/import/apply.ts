import 'server-only';

import { Decimal } from 'decimal.js';
import { SETTINGS_ALL_KEYS, valoriDaRighe } from '@/features/settings/schema';
import { netPriceForWrite } from '@/features/prices/calculation';
import {
  transactionForOrganization,
  type OrganizationJsonInput,
  type OrganizationPrismaClient,
} from '@/server/db';
import { prismaForOrganization } from '@/server/db';
import { applicaPrezzoInTransazione } from '@/server/repositories/prices';
import { nucleoDescrizione } from '@/server/domain/packaging/parse';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';
import { baseDi, type BaseUnit, type UnitOfMeasure } from '@/server/domain/packaging/units';
import { categoriaSuggerita } from '@/server/domain/catalog/categorie';
import { improntaDaCampi } from '@/server/domain/packaging/fingerprint';
import { normalizzaPrezzoIva, PrezzoIvaError } from '@/server/domain/pricing/vat';
import { cercaFotoMancanti } from '@/server/catalog/immagini/coda';
import { ricalcolaMiglioriOfferte } from './best-offer';
import {
  decisioneConfezioneApplicabile,
  motivoStatoNonApplicabile,
  trovaRigheBloccanti,
} from './apply-guards';
import { confermaNuovaConfezione } from './packaging-decision';
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
  /** Risultato della validazione deterministica della riga. */
  importabile?: boolean;
}

interface RigaCaricata {
  id: string;
  campi: CampiRiga;
  productId: string | null;
  supplierProductId: string | null;
  excluded: boolean;
  matchStatus: string;
  proposedAction: string;
  reviewedAt: Date | null;
  reviewedById: string | null;
  validationErrors: unknown;
}

export interface EsitoApplicazione extends RiepilogoImport {
  priceListId: string;
  creati: number;
  prezziScritti: number;
  disattivati: number;
  prodottiCreati: number;
}

interface StatoOffertaPrimaDellImport {
  id: string;
  active: boolean;
  disappearedAt: string | null;
  lastSeenAt: string;
  lastSeenPriceListId: string | null;
  currentPriceId: string | null;
  currentPriceValidTo: string | null;
  /** Assente nei vecchi snapshot; presente da quando la confezione è decidibile. */
  confezione?: {
    packagingType: string | null;
    packQuantity: number;
    packQuantityConfirmed: boolean;
    unitSize: string;
    unitOfMeasure: string;
    contentPerPack: string;
    baseUnit: string;
    fingerprint: string;
  };
}

interface SnapshotApplicazione {
  version: 1;
  offertePrima: StatoOffertaPrimaDellImport[];
  offerteCreate: string[];
  prodottiCreati: string[];
}

function recordJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function snapshotDaStats(stats: unknown): SnapshotApplicazione | null {
  const candidato = recordJson(stats).applicazione;
  if (!candidato || typeof candidato !== 'object' || Array.isArray(candidato)) return null;
  const s = candidato as Partial<SnapshotApplicazione>;
  const stringhe = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
  const confezioneValida = (value: unknown): boolean => {
    if (value === undefined) return true;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const c = value as Record<string, unknown>;
    return (
      (c.packagingType === null || typeof c.packagingType === 'string') &&
      typeof c.packQuantity === 'number' &&
      Number.isInteger(c.packQuantity) &&
      typeof c.packQuantityConfirmed === 'boolean' &&
      typeof c.unitSize === 'string' &&
      typeof c.unitOfMeasure === 'string' &&
      typeof c.contentPerPack === 'string' &&
      typeof c.baseUnit === 'string' &&
      typeof c.fingerprint === 'string'
    );
  };
  const statiValidi =
    Array.isArray(s.offertePrima) &&
    s.offertePrima.every(
      (offerta) =>
        offerta &&
        typeof offerta === 'object' &&
        typeof offerta.id === 'string' &&
        typeof offerta.active === 'boolean' &&
        typeof offerta.lastSeenAt === 'string' &&
        (offerta.disappearedAt === null || typeof offerta.disappearedAt === 'string') &&
        (offerta.lastSeenPriceListId === null || typeof offerta.lastSeenPriceListId === 'string') &&
        (offerta.currentPriceId === null || typeof offerta.currentPriceId === 'string') &&
        (offerta.currentPriceValidTo === null || typeof offerta.currentPriceValidTo === 'string') &&
        confezioneValida(offerta.confezione),
    );
  if (
    s.version !== 1 ||
    !statiValidi ||
    !stringhe(s.offerteCreate) ||
    !stringhe(s.prodottiCreati)
  ) {
    return null;
  }
  return s as SnapshotApplicazione;
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
  // Si caricano **tutte** le offerte del fornitore, non solo quelle della
  // copertura. Il riconoscimento non ha ragione di restringersi: un codice
  // articolo appartiene al fornitore, e il vincolo `(fornitore, codice)` lo
  // rende unico — cercarlo dentro una sola copertura non lo rendeva più
  // preciso, impediva soltanto di trovarlo. Un fornitore che manda un listino
  // unico con bibite, liquori e vini insieme — che è come i listini arrivano
  // davvero — trovava tutto «nuovo» e si fermava sul primo codice esistente.
  //
  // La copertura resta dov'è indispensabile: nel decidere chi può sparire.
  const offerte = await db.supplierProduct.findMany({
    where: { supplierId },
    select: {
      id: true,
      supplierCode: true,
      fingerprint: true,
      packagingType: true,
      packQuantity: true,
      unitSize: true,
      unitOfMeasure: true,
      active: true,
      lastSeenPriceList: { select: { scopeLabel: true } },
      currentPrice: { select: { priceNet: true } },
    },
  });

  return offerte.map((o) => ({
    supplierProductId: o.id,
    supplierCode: o.supplierCode,
    fingerprint: o.fingerprint,
    unitaDiVendita: o.packagingType,
    packQuantity: o.packQuantity,
    unitSize: new Decimal(o.unitSize.toString()),
    unitOfMeasure: o.unitOfMeasure,
    prezzoNetto: o.currentPrice ? new Decimal(o.currentPrice.priceNet.toString()) : null,
    active: o.active,
    nellaCopertura: o.lastSeenPriceList?.scopeLabel === scopeLabel,
  }));
}

function rigaDelFile(
  riga: RigaCaricata,
  iva: {
    pricesIncludeVat: boolean;
    aliquotaOfferta: string | null;
    aliquotaFornitore: string | null;
    aliquotaOrganizzazione: number;
  },
): RigaDelFile | null {
  const c = riga.campi;
  // Una riga inclusa senza descrizione verrà bloccata dalla validazione. Una
  // riga *esclusa* può invece bastare a provare che un codice è presente nel
  // documento: va passata alla riconciliazione, altrimenti quel codice
  // risulterebbe SPARITO proprio perché l'operatore lo ha escluso.
  if (!c.descrizione && !riga.excluded) return null;
  let prezzoNetto: Decimal | null = null;
  const importoPostSconti = c.prezzoNetto
    ? c.prezzoNetto
    : c.prezzoListino
      ? netPriceForWrite({ priceList: c.prezzoListino, discounts: c.sconti ?? [] }).toString()
      : null;
  if (importoPostSconti) {
    try {
      prezzoNetto = normalizzaPrezzoIva({
        prezzoQuotato: importoPostSconti,
        originePrezzo: 'PRICE_LIST',
        pricesIncludeVat: iva.pricesIncludeVat,
        aliquotaPrezzo: c.iva,
        aliquotaOfferta: iva.aliquotaOfferta,
        aliquotaFornitore: iva.aliquotaFornitore,
        aliquotaOrganizzazione: iva.aliquotaOrganizzazione,
      }).prezzoNetto;
    } catch (errore) {
      if (!(errore instanceof PrezzoIvaError)) throw errore;
      throw new ApplicazioneBloccataError(
        `La riga ${riga.id} ha dati IVA ambigui: ${errore.message}`,
        { righe: [riga.id] },
      );
    }
  }

  return {
    chiave: riga.id,
    supplierCode: c.codice ?? null,
    fingerprint: c.descrizione
      ? improntaDaCampi({
          descrizione: c.descrizione,
          unitaDiVendita: c.unitaDiVendita,
          unitSize: c.unitSize,
          unitOfMeasure: c.unitOfMeasure,
          packQuantity: c.packQuantity,
        })
      : null,
    unitaDiVendita: c.unitaDiVendita ?? null,
    packQuantity: c.packQuantity ?? 1,
    unitSize: new Decimal(c.unitSize ?? '1'),
    unitOfMeasure: c.unitOfMeasure ?? 'PIECE',
    prezzoNetto,
    inclusa: !riga.excluded,
  };
}

/**
 * Calcola cosa succederebbe applicando, **senza applicare**.
 *
 * È ciò che la schermata di revisione mostra prima di chiedere conferma: i
 * conteggi, le variazioni anomale, i casi in cui la confezione è cambiata.
 */
async function calcolaAnteprima(
  db: OrganizationPrismaClient,
  priceListId: string,
  defaultVat?: number,
): Promise<{
  confronti: Confronto[];
  riepilogo: RiepilogoImport;
  righe: Map<string, RigaCaricata>;
}> {
  const listino = await db.priceList.findFirst({
    where: { id: priceListId },
    select: {
      id: true,
      supplierId: true,
      scopeLabel: true,
      mode: true,
      supplier: { select: { pricesIncludeVat: true, defaultVatRate: true } },
      rows: {
        select: {
          id: true,
          extracted: true,
          productId: true,
          supplierProductId: true,
          excluded: true,
          matchStatus: true,
          proposedAction: true,
          reviewedAt: true,
          reviewedById: true,
          validationErrors: true,
          supplierProduct: { select: { vatRate: true } },
        },
        orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }],
      },
    },
  });
  if (!listino) throw new ApplicazioneBloccataError('Listino non trovato.');

  const ivaOrganizzazione =
    defaultVat ??
    valoriDaRighe(
      await db.setting.findMany({
        where: { key: { in: SETTINGS_ALL_KEYS } },
        select: { key: true, value: true },
      }),
    ).defaultVat;

  const righe = new Map<string, RigaCaricata>();
  const nelFile: RigaDelFile[] = [];
  for (const r of listino.rows) {
    const e = (r.extracted ?? {}) as { tipo?: string; campi?: CampiRiga };
    if (e.tipo !== 'prodotto') continue;
    const caricata: RigaCaricata = {
      id: r.id,
      // Una riga dichiarata prodotto senza campi non può essere importabile.
      // Tenerla nella mappa fa sì che il guard server-side la blocchi invece
      // di ignorarla e far risultare «sparita» un'offerta del catalogo.
      campi: e.campi ?? { importabile: false },
      productId: r.productId,
      supplierProductId: r.supplierProductId,
      excluded: r.excluded,
      matchStatus: r.matchStatus,
      proposedAction: r.proposedAction,
      reviewedAt: r.reviewedAt,
      reviewedById: r.reviewedById,
      validationErrors: r.validationErrors,
    };
    righe.set(r.id, caricata);
    const riga = rigaDelFile(caricata, {
      pricesIncludeVat: listino.supplier.pricesIncludeVat,
      aliquotaOfferta: r.supplierProduct?.vatRate?.toString() ?? null,
      aliquotaFornitore: listino.supplier.defaultVatRate?.toString() ?? null,
      aliquotaOrganizzazione: ivaOrganizzazione,
    });
    if (riga) nelFile.push(riga);
  }

  const aCatalogo = await caricaPerimetro(db, listino.supplierId, listino.scopeLabel);
  // In un aggiornamento parziale l'assenza di una riga non dice niente: il
  // file porta solo quello che il fornitore ha rimandato.
  const confronti = riconcilia(aCatalogo, nelFile, {
    segnalaSpariti: listino.mode !== 'PARTIAL',
  });
  for (const confronto of confronti) {
    if (confronto.esito !== 'CONFEZIONE_CAMBIATA' || !confronto.chiaveRiga) continue;
    const riga = righe.get(confronto.chiaveRiga);
    confronto.confezioneRisolta = Boolean(
      riga && decisioneConfezioneApplicabile(riga, confronto.supplierProductId),
    );
  }
  return { confronti, riepilogo: riepiloga(confronti), righe };
}

export async function anteprima(
  organizationId: string,
  priceListId: string,
): Promise<{
  confronti: Confronto[];
  riepilogo: RiepilogoImport;
  righe: Map<string, RigaCaricata>;
}> {
  return calcolaAnteprima(prismaForOrganization(organizationId), priceListId);
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
  const esito = await transactionForOrganization(
    organizationId,
    async (tx) => {
      // Stato e job si controllano *dentro* la stessa transazione che applica.
      // Due richieste simultanee leggono così una sola transizione REVIEW →
      // APPLYING; il retry serializzabile della seconda rilegge APPLIED e la
      // rifiuta, invece di riusare un'anteprima ormai vecchia.
      const listino = await tx.priceList.findFirst({
        where: { id: priceListId },
        select: {
          id: true,
          status: true,
          supplierId: true,
          scopeLabel: true,
          stats: true,
          job: { select: { phase: true } },
        },
      });
      if (!listino) throw new ApplicazioneBloccataError('Listino non trovato.');
      const motivoStato = motivoStatoNonApplicabile(listino.status, listino.job?.phase ?? null);
      if (motivoStato) throw new ApplicazioneBloccataError(motivoStato);

      await tx.priceList.update({
        where: { id: priceListId },
        data: { status: 'APPLYING' },
      });

      // Una sola lettura per anteprima e tutte le scritture dell'import: la
      // funzione prezzo viene chiamata centinaia di volte sulla connessione.
      const defaultVat = valoriDaRighe(
        await tx.setting.findMany({
          where: { key: { in: SETTINGS_ALL_KEYS } },
          select: { key: true, value: true },
        }),
      ).defaultVat;

      // L'anteprima autorevole viene ricalcolata dopo aver preso la riga del
      // listino nella transazione. Quella mostrata nella pagina resta utile per
      // l'operatore, ma non può essere la base di una scrittura concorrente.
      const { confronti, righe } = await calcolaAnteprima(tx, priceListId, defaultVat);
      const bloccanti = trovaRigheBloccanti(
        [...righe.values()].map((riga) => ({
          id: riga.id,
          excluded: riga.excluded,
          matchStatus: riga.matchStatus,
          importabile: riga.campi.importabile,
          validationErrors: riga.validationErrors,
        })),
      );
      if (bloccanti.pending.length > 0) {
        throw new ApplicazioneBloccataError(
          `${bloccanti.pending.length} ${bloccanti.pending.length === 1 ? 'riga ha' : 'righe hanno'} ` +
            'un abbinamento ancora da decidere. Conferma, rifiuta o escludi le righe prima di applicare.',
          { righe: bloccanti.pending },
        );
      }
      if (bloccanti.nonImportabili.length > 0) {
        throw new ApplicazioneBloccataError(
          `${bloccanti.nonImportabili.length} ${bloccanti.nonImportabili.length === 1 ? 'riga contiene' : 'righe contengono'} ` +
            'errori di validazione. Correggile o escludile esplicitamente prima di applicare.',
          { righe: bloccanti.nonImportabili },
        );
      }

      const daDecidere = confronti.filter(
        (c) => c.esito === 'CONFEZIONE_CAMBIATA' && !c.confezioneRisolta,
      );
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
      const offerteCreate: string[] = [];
      const prodottiCreatiIds: string[] = [];
      const oraApplicazione = new Date();
      const giornoApplicazione = oggi();

      // La categoria si assegna già alla nascita del prodotto: farlo dopo
      // significa un catalogo che passa da «tutto da classificare» a
      // «quasi tutto da classificare» a ogni import, e una coda che non
      // scende mai. La regola decide su poco più della metà; il resto
      // resta senza categoria, che è onesto, e si sistema dalla schermata
      // prodotti con un clic.
      const categorie = await tx.category.findMany({
        where: { active: true },
        select: { id: true, name: true },
      });
      // Indice normalizzato come nel classificatore: una maiuscola o un
      // accento diversi nella tassonomia non devono far mancare l'aggancio.
      const categoriaPerNome = new Map(
        categorie.map((c) => [normalizzaTesto(c.name), c.id] as const),
      );
      const categoriaDi = (testoFornitore: string | null, descrizione: string): string | null => {
        // La descrizione è l'unico testo disponibile qui: i listini di Cecconi e
        // Barzelli non hanno una colonna categoria, e le intestazioni di sezione
        // sono una sola in tutto il documento. `testoFornitore` resta nella firma
        // perché il giorno che un listino la porta, si aggancia in un punto solo.
        const nome = categoriaSuggerita(testoFornitore) ?? categoriaSuggerita(descrizione);
        return nome ? (categoriaPerNome.get(normalizzaTesto(nome)) ?? null) : null;
      };

      // Il revert non può dedurre questi valori da lastSeenPriceListId: un
      // prodotto sparito, per definizione, continua a puntare al listino
      // precedente. Si salva quindi la fotografia minima *prima* di toccare
      // ciascuna offerta, nello stesso commit dell'applicazione.
      const idsEsistenti = [
        ...new Set(
          confronti
            .map((confronto) => confronto.supplierProductId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const offertePrima = await tx.supplierProduct.findMany({
        where: { id: { in: idsEsistenti } },
        select: {
          id: true,
          active: true,
          disappearedAt: true,
          lastSeenAt: true,
          lastSeenPriceListId: true,
          currentPriceId: true,
          currentPrice: { select: { validTo: true } },
          packagingType: true,
          packQuantity: true,
          packQuantityConfirmed: true,
          unitSize: true,
          unitOfMeasure: true,
          contentPerPack: true,
          baseUnit: true,
          fingerprint: true,
        },
      });
      const snapshotOfferte: StatoOffertaPrimaDellImport[] = offertePrima.map((offerta) => ({
        id: offerta.id,
        active: offerta.active,
        disappearedAt: offerta.disappearedAt?.toISOString() ?? null,
        lastSeenAt: offerta.lastSeenAt.toISOString(),
        lastSeenPriceListId: offerta.lastSeenPriceListId,
        currentPriceId: offerta.currentPriceId,
        currentPriceValidTo: offerta.currentPrice?.validTo?.toISOString() ?? null,
        confezione: {
          packagingType: offerta.packagingType,
          packQuantity: offerta.packQuantity,
          packQuantityConfirmed: offerta.packQuantityConfirmed,
          unitSize: offerta.unitSize.toString(),
          unitOfMeasure: offerta.unitOfMeasure,
          contentPerPack: offerta.contentPerPack.toString(),
          baseUnit: offerta.baseUnit,
          fingerprint: offerta.fingerprint,
        },
      }));

      for (const confronto of confronti) {
        if (confronto.esito === 'SPARITO') {
          // Mai cancellato: si perderebbero storico e ordini passati.
          await tx.supplierProduct.update({
            where: { id: confronto.supplierProductId! },
            data: { active: false, disappearedAt: oraApplicazione },
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
                categoryId: categoriaDi(null, c.descrizione!),
                createdBy: 'IMPORT',
              },
              select: { id: true },
            });
            productId = creato.id;
            prodottiCreati += 1;
            prodottiCreatiIds.push(creato.id);
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
              fingerprint: improntaDaCampi({
                descrizione: c.descrizione!,
                unitaDiVendita: c.unitaDiVendita,
                unitSize: c.unitSize,
                unitOfMeasure: c.unitOfMeasure,
                packQuantity: c.packQuantity,
              }),
              matchStatus: riga.matchStatus === 'CONFIRMED' ? 'CONFIRMED' : 'AUTO',
              lastSeenPriceListId: priceListId,
            },
            select: { id: true },
          });
          supplierProductId = offerta.id;
          creati += 1;
          offerteCreate.push(offerta.id);
        }

        if (!supplierProductId) continue;

        if (confronto.esito === 'CONFEZIONE_CAMBIATA') {
          if (!confronto.confezioneRisolta) {
            // Difesa ridondante rispetto al guard di gruppo: il loop non deve
            // mai interpretare uno stato parziale come decisione umana.
            throw new ApplicazioneBloccataError(
              'La decisione sulla confezione non è completa: aggiorna la revisione e riprova.',
              { righe: [riga.id] },
            );
          }
          if (confronto.nuovaConfezioneApplicabile === false) {
            throw new ApplicazioneBloccataError(
              'Il formato unitario è cambiato: non può essere aggiornato come semplice confezione.',
              { righe: [riga.id] },
            );
          }
          const confermati = confermaNuovaConfezione(c as Record<string, unknown>);
          const unitOfMeasure = confermati.unitOfMeasure as UnitOfMeasure;
          const fingerprint = improntaDaCampi({
            descrizione: c.descrizione!,
            unitaDiVendita: confermati.unitaDiVendita,
            unitSize: confermati.unitSize,
            unitOfMeasure,
            packQuantity: confermati.packQuantity,
          });
          const gemella = await tx.supplierProduct.findFirst({
            where: {
              supplierId: listino.supplierId,
              id: { not: supplierProductId },
              fingerprint,
            },
            select: { id: true },
          });
          if (gemella) {
            throw new ApplicazioneBloccataError(
              'La nuova confezione coincide con un’altra offerta dello stesso fornitore.',
              { righe: [riga.id] },
            );
          }
          await tx.supplierProduct.update({
            where: { id: supplierProductId },
            data: {
              rawName: c.descrizione!.slice(0, 300),
              normalizedName: nucleoDescrizione(c.descrizione!) || normalizzaTesto(c.descrizione!),
              packagingType: confermati.unitaDiVendita ?? null,
              packQuantity: confermati.packQuantity!,
              packQuantityConfirmed: true,
              unitSize: confermati.unitSize!,
              unitOfMeasure,
              contentPerPack: confermati.contentPerPack!,
              baseUnit: confermati.baseUnit as 'PIECE' | 'KG' | 'L',
              fingerprint,
            },
          });
        }

        // «L'ho rivisto in questo listino» è un dato, e serve alla prossima
        // riconciliazione per sapere cosa appartiene al perimetro.
        await tx.supplierProduct.update({
          where: { id: supplierProductId },
          data: {
            lastSeenAt: oraApplicazione,
            lastSeenPriceListId: priceListId,
            active: true,
            disappearedAt: null,
          },
        });

        // Prezzo invariato: nessuna riga nuova nello storico.
        if (confronto.esito === 'INVARIATO') continue;
        if (!c.prezzoListino && !c.prezzoNetto) continue;

        const prezzo = await applicaPrezzoInTransazione(
          tx,
          supplierProductId,
          {
            priceList: c.prezzoListino ?? c.prezzoNetto!,
            discounts: c.sconti ?? [],
            // L'importo post-sconti dichiarato dal documento vince sul
            // ricalcolo; il repository lo trasforma poi nell'imponibile
            // canonico se il listino del fornitore include l'IVA.
            priceNet: c.prezzoNetto ?? undefined,
            vatRate: c.iva ?? undefined,
            validFrom: giornoApplicazione,
            source: 'PRICE_LIST',
            priceListId,
          },
          userId,
          { defaultVat },
        );
        if (prezzo.created) prezziScritti += 1;

        await tx.priceList.update({
          where: { id: priceListId },
          data: { rows: { update: { where: { id: riga.id }, data: { supplierProductId } } } },
        });
      }

      await tx.priceList.update({
        where: { id: priceListId },
        data: {
          status: 'APPLIED',
          // Dopo tutte le mutazioni: così `updatedAt > appliedAt` significa
          // davvero che qualcuno ha toccato il catalogo *dopo* l'import.
          appliedAt: new Date(),
          revertedAt: null,
          stats: {
            ...recordJson(listino.stats),
            applicazione: {
              version: 1,
              offertePrima: snapshotOfferte,
              offerteCreate,
              prodottiCreati: prodottiCreatiIds,
            } satisfies SnapshotApplicazione,
          } as unknown as OrganizationJsonInput,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'PRICE_LIST_APPLIED',
          entityType: 'PriceList',
          entityId: priceListId,
          detail: {
            offerteCreate: creati,
            prezziScritti,
            offerteDisattivate: disattivati,
            prodottiCreati,
          },
        },
      });
      return {
        priceListId,
        ...riepiloga(confronti),
        creati,
        prezziScritti,
        disattivati,
        prodottiCreati,
      };
    },
    { maxAttempts: 5 },
  );

  // Fuori dalla transazione: e' un dato derivato, e se fallisse non deve
  // poter annullare un import corretto. Il peggio che capita e' una miglior
  // offerta vecchia di qualche minuto.
  try {
    await ricalcolaMiglioriOfferte(organizationId);
  } catch (errore) {
    console.error(`Ricalcolo delle migliori offerte dopo l'import ${priceListId} fallito:`, errore);
  }

  // Le foto dei prodotti nuovi, **senza aspettarle**.
  //
  // Sono minuti di richieste a un servizio esterno, una per volta. Chi ha
  // appena caricato il listino ha già quello che gli serviva — i prezzi — e
  // non deve restare fermo davanti a una rotellina perché stiamo cercando
  // delle figure. `void`: si parte e si va avanti; se la ricerca fallisce,
  // fallisce da sola e l'import resta valido.
  void cercaFotoMancanti(organizationId);

  return esito;
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
  userId: string,
): Promise<EsitoAnnullamento> {
  const esito = await transactionForOrganization(
    organizationId,
    async (tx) => {
      const listino = await tx.priceList.findFirst({
        where: { id: priceListId },
        select: {
          id: true,
          status: true,
          supplierId: true,
          appliedAt: true,
          stats: true,
        },
      });
      if (!listino) throw new ApplicazioneBloccataError('Listino non trovato.');
      if (listino.status !== 'APPLIED' || !listino.appliedAt) {
        throw new ApplicazioneBloccataError(
          'Questo listino non è stato applicato: non c’è nulla da annullare.',
        );
      }

      const snapshot = snapshotDaStats(listino.stats);
      if (!snapshot) {
        // I vecchi import non registravano chi avessero creato né lo stato
        // precedente delle offerte. Deducendolo da lastSeenPriceListId si può
        // cancellare un'offerta manuale o non riattivare uno SPARITO. In
        // assenza della prova, la scelta sicura è non toccare il database.
        throw new ApplicazioneBloccataError(
          'Questo import è precedente alla fotografia di annullamento sicuro e non può essere ' +
            'ripristinato automaticamente. Applica un listino correttivo oppure ripristina un backup verificato.',
        );
      }

      // Annullare un import intermedio richiederebbe riscrivere anche gli
      // intervalli dei listini successivi. Si ammette soltanto l'ultimo import
      // applicato di quel fornitore.
      const successivo = await tx.priceList.findFirst({
        where: {
          id: { not: priceListId },
          supplierId: listino.supplierId,
          status: 'APPLIED',
          // `gte` è intenzionale: due commit nello stesso millisecondo non
          // hanno un ordine dimostrabile, quindi non si indovina quale sia
          // l'ultimo.
          appliedAt: { gte: listino.appliedAt },
        },
        select: { id: true },
      });
      if (successivo) {
        throw new ApplicazioneBloccataError(
          'Dopo questo listino ne è già stato applicato un altro per lo stesso fornitore. ' +
            'Annulla prima quello più recente.',
        );
      }

      const idsToccati = [
        ...new Set([
          ...snapshot.offertePrima.map((offerta) => offerta.id),
          ...snapshot.offerteCreate,
        ]),
      ];
      const offerteAttuali = await tx.supplierProduct.findMany({
        where: { id: { in: idsToccati } },
        select: {
          id: true,
          productId: true,
          active: true,
          currentPriceId: true,
          updatedAt: true,
          prices: {
            select: { id: true, priceListId: true, validTo: true, createdAt: true },
          },
          bestOfferOf: { select: { productId: true } },
          _count: {
            select: {
              orderLines: true,
              priceListRows: { where: { priceListId: { not: priceListId } } },
            },
          },
        },
      });
      if (offerteAttuali.length !== idsToccati.length) {
        throw new ApplicazioneBloccataError(
          "Il catalogo è cambiato dopo l'import: manca almeno un'offerta da ripristinare.",
        );
      }
      const perId = new Map(offerteAttuali.map((offerta) => [offerta.id, offerta] as const));

      const prezzoSuccessivo = offerteAttuali.some((offerta) =>
        offerta.prices.some(
          (prezzo) => prezzo.priceListId !== priceListId && prezzo.createdAt > listino.appliedAt!,
        ),
      );
      if (prezzoSuccessivo) {
        throw new ApplicazioneBloccataError(
          "Dopo l'import è stato registrato un prezzo più recente. Annullarlo sovrascriverebbe quel cambiamento.",
        );
      }
      if (offerteAttuali.some((offerta) => offerta.updatedAt > listino.appliedAt!)) {
        throw new ApplicazioneBloccataError(
          "Almeno un'offerta è stata modificata dopo l'import. L'annullamento non può sovrascrivere quel lavoro.",
        );
      }

      const createConLegami = snapshot.offerteCreate.find((id) => {
        const offerta = perId.get(id)!;
        return offerta._count.orderLines > 0 || offerta._count.priceListRows > 0;
      });
      if (createConLegami) {
        throw new ApplicazioneBloccataError(
          "Un'offerta creata da questo import è già usata da un ordine o da un altro listino e non può essere rimossa.",
        );
      }

      // Un prodotto creato dall'import si può eliminare soltanto se nessun
      // dato successivo gli si è agganciato. Le offerte create dalla stessa
      // applicazione sono ammesse: verranno rimosse poco sotto.
      for (const productId of snapshot.prodottiCreati) {
        const prodotto = await tx.product.findFirst({
          where: { id: productId },
          select: {
            updatedAt: true,
            supplierProducts: { select: { id: true } },
            _count: { select: { aliases: true, orderLines: true, priceListRows: true } },
          },
        });
        if (!prodotto) {
          throw new ApplicazioneBloccataError(
            "Il catalogo è cambiato dopo l'import: manca almeno un prodotto da ripristinare.",
          );
        }
        if (prodotto.updatedAt > listino.appliedAt) {
          throw new ApplicazioneBloccataError(
            "Un prodotto creato dall'import è stato modificato in seguito e non può essere eliminato.",
          );
        }
        const offerteEsterne = prodotto.supplierProducts.some(
          (offerta) => !snapshot.offerteCreate.includes(offerta.id),
        );
        if (
          offerteEsterne ||
          prodotto._count.aliases > 0 ||
          prodotto._count.orderLines > 0 ||
          prodotto._count.priceListRows > 0
        ) {
          throw new ApplicazioneBloccataError(
            'Un prodotto creato da questo import è già usato da altri dati e non può essere rimosso.',
          );
        }
      }

      const risultato: EsitoAnnullamento = {
        prezziRimossi: 0,
        prezziRiaperti: 0,
        offerteRimosse: 0,
        prodottiRimossi: 0,
        offerteRiattivate: 0,
      };

      // Si sciolgono prima tutti i puntatori correnti; soltanto dopo si possono
      // cancellare le righe prezzo create dal listino.
      for (const offerta of offerteAttuali) {
        await tx.supplierProduct.update({
          where: { id: offerta.id },
          data: { currentPriceId: null },
        });
        for (const prezzo of offerta.prices.filter((p) => p.priceListId === priceListId)) {
          await tx.supplierProduct.update({
            where: { id: offerta.id },
            data: { prices: { delete: { id: prezzo.id } } },
          });
          risultato.prezziRimossi += 1;
        }
      }

      for (const prima of snapshot.offertePrima) {
        const attuale = perId.get(prima.id)!;
        const prezzoPrecedente = prima.currentPriceId
          ? attuale.prices.find((prezzo) => prezzo.id === prima.currentPriceId)
          : null;
        if (prima.currentPriceId && !prezzoPrecedente) {
          throw new ApplicazioneBloccataError(
            "Lo storico prezzi è cambiato dopo l'import e non può essere ripristinato automaticamente.",
          );
        }

        const validToPrecedente = prima.currentPriceValidTo
          ? new Date(prima.currentPriceValidTo)
          : null;
        if (prezzoPrecedente) {
          const diverso =
            (prezzoPrecedente.validTo?.toISOString() ?? null) !==
            (validToPrecedente?.toISOString() ?? null);
          await tx.supplierProduct.update({
            where: { id: prima.id },
            data: {
              prices: {
                update: {
                  where: { id: prezzoPrecedente.id },
                  data: { validTo: validToPrecedente },
                },
              },
            },
          });
          if (diverso) risultato.prezziRiaperti += 1;
        }

        if (prima.active && !attuale.active) risultato.offerteRiattivate += 1;
        await tx.supplierProduct.update({
          where: { id: prima.id },
          data: {
            active: prima.active,
            disappearedAt: prima.disappearedAt ? new Date(prima.disappearedAt) : null,
            lastSeenAt: new Date(prima.lastSeenAt),
            lastSeenPriceListId: prima.lastSeenPriceListId,
            currentPriceId: prima.currentPriceId,
            ...(prima.confezione
              ? {
                  packagingType: prima.confezione.packagingType,
                  packQuantity: prima.confezione.packQuantity,
                  packQuantityConfirmed: prima.confezione.packQuantityConfirmed,
                  unitSize: prima.confezione.unitSize,
                  unitOfMeasure: prima.confezione.unitOfMeasure as UnitOfMeasure,
                  contentPerPack: prima.confezione.contentPerPack,
                  baseUnit: prima.confezione.baseUnit as BaseUnit,
                  fingerprint: prima.confezione.fingerprint,
                }
              : {}),
          },
        });
      }

      // Le righe di staging erano scollegate dalle offerte nate durante apply.
      // Si ripristina anche quel dettaglio prima della cancellazione.
      if (snapshot.offerteCreate.length > 0) {
        await tx.priceList.update({
          where: { id: priceListId },
          data: {
            rows: {
              updateMany: {
                where: { supplierProductId: { in: snapshot.offerteCreate } },
                data: { supplierProductId: null },
              },
            },
          },
        });
      }

      for (const id of snapshot.offerteCreate) {
        const offerta = perId.get(id)!;
        for (const best of offerta.bestOfferOf) {
          await tx.product.update({
            where: { id: best.productId },
            data: { bestOffer: { delete: true } },
          });
        }
        await tx.supplierProduct.delete({ where: { id } });
        risultato.offerteRimosse += 1;
      }

      for (const id of snapshot.prodottiCreati) {
        await tx.product.delete({ where: { id } });
        risultato.prodottiRimossi += 1;
      }

      await tx.priceList.update({
        where: { id: priceListId },
        data: { status: 'REVERTED', revertedAt: new Date(), appliedAt: null },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'PRICE_LIST_REVERTED',
          entityType: 'PriceList',
          entityId: priceListId,
          detail: { ...risultato },
        },
      });
      return risultato;
    },
    { maxAttempts: 5 },
  );

  // Anche qui fuori dalla transazione, e per lo stesso motivo: dopo un
  // annullamento le migliori offerte sono quelle di prima, e vanno rifatte.
  try {
    await ricalcolaMiglioriOfferte(organizationId);
  } catch (errore) {
    console.error(`Ricalcolo delle migliori offerte dopo l'annullamento fallito:`, errore);
  }

  return esito;
}
