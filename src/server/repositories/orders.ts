import 'server-only';

import { Decimal } from 'decimal.js';
import type {
  ElencoOrdini,
  EsitoConferma,
  EsitoRiordino,
  OrdineStorico,
  OffertaOrdinabile,
  OrdineCorrente,
  RiepilogoOrdine,
  RigaOrdine,
  RisultatoOrdinabile,
} from '@/features/orders/dto';
import type {
  ConfermaOrdineInput,
  ElencoOrdiniQuery,
  RicercaOrdinabile,
  RigaOrdineInput,
  RigaOrdinePatch,
} from '@/features/orders/schema';
import { selezionaRigheSenzaConfronto } from '@/features/orders/summary';
import { urlImmagine } from '@/server/catalog/immagini/archivio';
import { rimuoviDocumento } from '@/server/export/archivio';
import {
  prismaForOrganization,
  transactionForOrganization,
  type OrganizationPrismaClient,
} from '@/server/db';
import {
  calcolaCambio,
  confrontaPerAvviso,
  contenutoConfezioneFotografato,
  type OffertaPerAvviso,
} from '@/server/domain/orders/alert';
import { prossimoCodiceOrdine } from '@/server/domain/orders/code';
import { condizioniRigheStorico, raggruppaRigheStoriche } from '@/server/domain/orders/history';
import { confezioniValide, totaliOrdine, totaliRiga } from '@/server/domain/orders/totals';
import { versionePrezziOrdine, type PrezzoVistoOrdine } from '@/server/domain/orders/version';
import { nettoEffettivo, percentualeApplicata } from '@/server/domain/pricing/extra-discount';
import { PrezzoIvaError, risolviAliquotaIva } from '@/server/domain/pricing/vat';
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

/** Il riepilogo aperto non descrive più la bozza che si sta confermando. */
export class OrderVersionError extends Error {
  override readonly name = 'OrderVersionError';
}

/**
 * Tutto ciò che serve per trasformare un'offerta viva in uno snapshot d'ordine.
 * La stessa selezione viene usata da aggiunta, cambio fornitore, riordino e
 * conferma: quattro copie leggermente diverse sono il modo in cui prezzo o IVA
 * finiscono aggiornati in una strada e vecchi in un'altra.
 */
const OFFERTA_ORDINE_SELECT = {
  id: true,
  supplierId: true,
  productId: true,
  supplierCode: true,
  rawName: true,
  packQuantity: true,
  packagingType: true,
  unitSize: true,
  unitOfMeasure: true,
  contentPerPack: true,
  vatRate: true,
  active: true,
  supplier: {
    select: {
      id: true,
      name: true,
      active: true,
      defaultVatRate: true,
    },
  },
  product: { select: { name: true } },
  currentPrice: {
    select: {
      id: true,
      priceNet: true,
      vatRate: true,
      unitPriceBasis: true,
      validFrom: true,
    },
  },
} as const;

type DecimalLike = { toString(): string };
type OffertaOrdine = {
  id: string;
  supplierId: string;
  productId: string | null;
  supplierCode: string | null;
  rawName: string;
  packQuantity: number;
  packagingType: string | null;
  unitSize: DecimalLike;
  unitOfMeasure: RigaOrdine['unitOfMeasure'];
  contentPerPack: DecimalLike;
  vatRate: DecimalLike | null;
  active: boolean;
  supplier: {
    id: string;
    name: string;
    active: boolean;
    defaultVatRate: DecimalLike | null;
  };
  product: { name: string } | null;
  currentPrice: {
    id: string;
    priceNet: DecimalLike;
    vatRate: DecimalLike | null;
    unitPriceBasis: Exclude<RigaOrdine['unitPriceBasis'], null>;
    validFrom: Date;
  } | null;
};
type OffertaOrdinabileRecord = OffertaOrdine & {
  currentPrice: NonNullable<OffertaOrdine['currentPrice']>;
};

function richiediOffertaOrdinabile(
  offerta: OffertaOrdine,
  nome: string,
): asserts offerta is OffertaOrdinabileRecord {
  if (!offerta.active) {
    throw new OrderValidationError(`${nome} non è più a listino.`);
  }
  if (!offerta.supplier.active) {
    throw new OrderValidationError(`Il fornitore di ${nome.toLocaleLowerCase('it')} non è attivo.`);
  }
  if (!offerta.currentPrice) {
    throw new OrderValidationError(`${nome} non ha più un prezzo corrente.`);
  }
}

function prezzoOperativo(offerta: OffertaOrdinabileRecord, ivaOrganizzazione: number) {
  try {
    const aliquota = risolviAliquotaIva({
      aliquotaPrezzo: offerta.currentPrice.vatRate?.toString() ?? null,
      aliquotaOfferta: offerta.vatRate?.toString() ?? null,
      aliquotaFornitore: offerta.supplier.defaultVatRate?.toString() ?? null,
      aliquotaOrganizzazione: ivaOrganizzazione,
    });
    return {
      // `price_net` è l'imponibile canonico. Gli eventuali listini lordi
      // vengono normalizzati quando il prezzo viene scritto, mai qui.
      prezzoNetto: new Decimal(offerta.currentPrice.priceNet.toString()),
      aliquotaIva: aliquota.valore,
    };
  } catch (errore) {
    if (!(errore instanceof PrezzoIvaError)) throw errore;
    const nome = offerta.product?.name ?? offerta.rawName;
    throw new OrderValidationError(`IVA non valida per «${nome}»: ${errore.message}`);
  }
}

function snapshotDaOfferta(
  offerta: OffertaOrdinabileRecord,
  confezioni: number,
  ivaOrganizzazione: number,
) {
  const prezzo = prezzoOperativo(offerta, ivaOrganizzazione);
  const totali = totaliRiga({
    prezzoConfezione: prezzo.prezzoNetto,
    confezioni,
    aliquotaIva: prezzo.aliquotaIva,
  });

  return {
    productId: offerta.productId,
    supplierId: offerta.supplierId,
    priceId: offerta.currentPrice.id,
    nameSnapshot: offerta.product?.name ?? offerta.rawName,
    supplierNameSnapshot: offerta.supplier.name,
    supplierCodeSnapshot: offerta.supplierCode,
    packQuantitySnapshot: offerta.packQuantity,
    packagingTypeSnapshot: offerta.packagingType,
    unitSizeSnapshot: offerta.unitSize.toString(),
    uomSnapshot: offerta.unitOfMeasure,
    unitPriceNetSnapshot: prezzo.prezzoNetto.toString(),
    vatRateSnapshot: prezzo.aliquotaIva.toString(),
    unitPriceBasisSnapshot: offerta.currentPrice.unitPriceBasis,
    lineTotalNet: totali.netto.toString(),
    lineTotalGross: totali.lordo.toString(),
  };
}

/**
 * Gli stessi valori vivi che la conferma trasferirà nello snapshot di riga.
 * Riepilogo e conferma devono passare da questa sola funzione: aggiungere un
 * campo allo snapshot senza aggiungerlo alla firma riaprirebbe una race.
 */
function prezzoVistoDaOfferta(
  offerta: OffertaOrdine,
  lineId: string,
  quantityPacks: number,
  ivaOrganizzazione: number,
): PrezzoVistoOrdine {
  const prezzo = offerta.currentPrice
    ? prezzoOperativo(offerta as OffertaOrdinabileRecord, ivaOrganizzazione)
    : null;

  return {
    lineId,
    quantityPacks,
    supplierProductId: offerta.id,
    supplierId: offerta.supplierId,
    productId: offerta.productId,
    nameSnapshot: offerta.product?.name ?? offerta.rawName,
    supplierNameSnapshot: offerta.supplier.name,
    supplierCodeSnapshot: offerta.supplierCode,
    packQuantitySnapshot: offerta.packQuantity,
    packagingTypeSnapshot: offerta.packagingType,
    unitSizeSnapshot: offerta.unitSize.toString(),
    uomSnapshot: offerta.unitOfMeasure,
    currentPriceId: offerta.currentPrice?.id ?? null,
    priceNet: prezzo?.prezzoNetto.toString() ?? null,
    vatRate: prezzo?.aliquotaIva.toString() ?? null,
    unitPriceBasisSnapshot: offerta.currentPrice?.unitPriceBasis ?? null,
  };
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
  supplierProduct: {
    select: {
      packagingType: true,
      contentPerPack: true,
      extraDiscountExcluded: true,
      extraDiscountPct: true,
      supplier: { select: { extraDiscountPct: true } },
    },
  },
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
  supplierProduct: {
    packagingType: string | null;
    contentPerPack: { toString(): string };
    extraDiscountExcluded: boolean;
    extraDiscountPct: { toString(): string } | null;
    supplier: { extraDiscountPct: { toString(): string } | null };
  };
};

function mapRiga(r: RigaRecord): RigaOrdine {
  const netto = new Decimal(r.unitPriceNetSnapshot.toString());
  const contenuto = new Decimal(r.supplierProduct.contentPerPack.toString());

  // Lo sconto extra si legge **adesso** dal fornitore, non dallo snapshot:
  // è un accordo commerciale che cambia con la trattativa, non un prezzo di
  // listino. Un ordine di ieri deve dire quanto tornerà indietro alle
  // condizioni di oggi, che sono quelle con cui verrà liquidato.
  const sconto = {
    percentualeFornitore: r.supplierProduct.supplier.extraDiscountPct?.toString() ?? null,
    esclusa: r.supplierProduct.extraDiscountExcluded,
    percentualeSua: r.supplierProduct.extraDiscountPct?.toString() ?? null,
  };
  const pct = percentualeApplicata(sconto);
  const ritorno = netto
    .minus(nettoEffettivo(netto, sconto))
    .mul(r.quantityPacks)
    .toDecimalPlaces(2);

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
    scontoExtraPct: pct.toString(),
    ritornoAtteso: ritorno.toString(),
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
   * Il fallback IVA letto sullo stesso client dell'operazione corrente.
   * Nelle conferme e nei riordini il client è quello transazionale: un retry
   * non riusa mai un'impostazione letta dal tentativo precedente.
   */
  async function ivaPredefinita(client: OrganizationPrismaClient): Promise<number> {
    return valoriDaRighe(
      await client.setting.findMany({
        where: { key: { in: SETTINGS_ALL_KEYS } },
        select: { key: true, value: true },
      }),
    ).defaultVat;
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
        const bloccata = await tx.order.updateMany({
          where: { id: orderId, status: 'DRAFT' },
          data: { updatedAt: new Date() },
        });
        if (bloccata.count !== 1) {
          throw new OrderValidationError(
            'L’ordine non è più una bozza: ricarica la pagina prima di modificarlo.',
          );
        }
        return operazione(tx);
      },
      { isolamento: 'riga-bloccata' },
    );
  }

  async function leggi(
    orderId: string,
    offerteConfrontatePerProdotto?: Map<string, number>,
  ): Promise<OrdineCorrente> {
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
    const prodottiInOrdine = [
      ...new Set(righe.map((r) => r.productId).filter((id): id is string => id !== null)),
    ];
    const confrontoPerProdotto = await confronti.perProdotti(prodottiInOrdine);
    if (offerteConfrontatePerProdotto) {
      for (const [productId, confronto] of confrontoPerProdotto) {
        offerteConfrontatePerProdotto.set(productId, confronto.offersCompared);
      }
    }

    let risparmioPotenziale = new Decimal(0);
    let righeConAvviso = 0;

    for (const riga of righe) {
      if (!riga.productId) continue;
      const confronto = confrontoPerProdotto.get(riga.productId);
      if (!confronto) continue;

      const perAvviso = (o: (typeof confronto.ranked)[number]): OffertaPerAvviso => ({
        supplierProductId: o.supplierProductId,
        supplierName: o.supplierName,
        // **L'effettivo, non il listino.**
        //
        // È lo stesso numero su cui la classifica dell'elenco decide chi è
        // «migliore», e devono essere lo stesso o le due schermate si
        // contraddicono. Succedeva: il succo Amita pesca costa 15,52 € da AD
        // Beverage e 14,88 € da Barzetti, ma AD Beverage rimborsa il 5% e
        // quindi viene a costare 14,74 €. L'elenco lo segnava migliore —
        // giusto — e il riepilogo consigliava di passare a Barzetti «per
        // risparmiare», che avrebbe fatto spendere 14 centesimi in più a
        // confezione.
        //
        // Un avviso che spinge a cambiare fornitore è il posto peggiore dove
        // sbagliare: è l'unico che chiede di rifare una scelta già fatta, e
        // chi lo segue non ha modo di accorgersi che ci ha rimesso.
        prezzoConfezione: o.priceEffective,
        prezzoConfezioneListino: o.priceNet,
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
    const gruppi = new Map<
      string,
      { supplierName: string; righe: number; confezioni: number; netto: Decimal; ritorno: Decimal }
    >();
    for (const riga of righe) {
      const g = gruppi.get(riga.supplierId) ?? {
        supplierName: riga.supplierName,
        righe: 0,
        confezioni: 0,
        netto: new Decimal(0),
        ritorno: new Decimal(0),
      };
      g.righe += 1;
      g.confezioni += riga.quantityPacks;
      g.netto = g.netto.plus(riga.lineTotalNet);
      g.ritorno = g.ritorno.plus(riga.ritornoAtteso);
      gruppi.set(riga.supplierId, g);
    }
    const ritornoAtteso = righe.reduce((a, r) => a.plus(r.ritornoAtteso), new Decimal(0));

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
        ritornoAtteso: ritornoAtteso.toDecimalPlaces(2).toString(),
      },
      perFornitore: [...gruppi.entries()]
        .map(([supplierId, g]) => ({
          supplierId,
          supplierName: g.supplierName,
          righe: g.righe,
          confezioni: g.confezioni,
          netto: g.netto.toString(),
          ritornoAtteso: g.ritorno.toDecimalPlaces(2).toString(),
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
        : (
            (await db.product.findMany({
              where: {
                supplierProducts: { some: { active: true, currentPriceId: { not: null } } },
              },
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
            }[]
          ).map((p) => ({
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
      const [mappa, ordine, conFoto] = await Promise.all([
        confronti.perProdotti(ids),
        leggi(await idBozza(userId)),
        // Una lettura a parte, per chiave primaria: la ricerca per testo passa
        // da SQL grezzo e non porta questa colonna, e aggiungercela
        // significherebbe toccare la query di ricerca — che è la cosa più
        // delicata del catalogo — per una figura.
        db.product.findMany({
          where: { id: { in: ids }, imagePath: { not: null } },
          select: { id: true },
        }),
      ]);
      const hannoFoto = new Set(conFoto.map((p) => p.id));

      const nellOrdine = new Map<string, number>();
      for (const riga of ordine.righe) {
        if (riga.productId) {
          nellOrdine.set(
            riga.productId,
            (nellOrdine.get(riga.productId) ?? 0) + riga.quantityPacks,
          );
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
          packQuantityConfirmed: o.packQuantityConfirmed,
          unitSize: o.unitSize,
          unitOfMeasure: o.unitOfMeasure,
          baseUnit: o.baseUnit,
          scontoExtraPct: o.extraDiscountPct,
          prezzoEffettivo: o.priceEffective,
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
          imageUrl: hannoFoto.has(hit.id) ? urlImmagine(hit.id) : null,
          offerte,
          nonOrdinabile:
            offerte.length === 0 ? (confronto.reason ?? 'Nessun prezzo corrente.') : null,
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

      if (!confezioniValide(input.quantityPacks)) {
        throw new OrderValidationError('La quantità richiesta non è valida.');
      }

      const offerta = await db.supplierProduct.findFirst({
        where: { id: input.supplierProductId },
        select: OFFERTA_ORDINE_SELECT,
      });
      if (!offerta) throw new OrderNotFoundError('L’offerta indicata non esiste.');
      richiediOffertaOrdinabile(offerta, 'Questa offerta');

      const confronto = offerta.productId ? await confronti.perProdotto(offerta.productId) : null;
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

      await conOrdineBloccato(orderId, async (tx) => {
        // Il fornitore può essere stato disattivato fra il caricamento del
        // catalogo e il clic. La decisione finale si prende sotto il lock
        // della bozza, non sulla fotografia usata per disegnare la pagina.
        const corrente = await tx.supplierProduct.findFirst({
          where: { id: offerta.id },
          select: OFFERTA_ORDINE_SELECT,
        });
        if (!corrente) throw new OrderNotFoundError('L’offerta indicata non esiste.');
        richiediOffertaOrdinabile(corrente, 'Questa offerta');

        const esistente = await tx.order.findFirstOrThrow({
          where: { id: orderId },
          select: {
            lines: {
              where: { supplierProductId: corrente.id },
              select: { id: true, quantityPacks: true },
            },
            _count: { select: { lines: true } },
          },
        });

        const riga = esistente.lines[0];
        const quantita = (riga?.quantityPacks ?? 0) + input.quantityPacks;
        if (!confezioniValide(quantita)) {
          throw new OrderValidationError(
            'La quantità complessiva supera il massimo di 9.999 confezioni.',
          );
        }
        const snapshot = snapshotDaOfferta(corrente, quantita, await ivaPredefinita(tx));

        if (riga) {
          await tx.order.update({
            where: { id: orderId },
            data: {
              lines: {
                update: {
                  where: { id: riga.id },
                  data: {
                    quantityPacks: quantita,
                    ...snapshot,
                    ...(input.note !== undefined ? { note: input.note ?? null } : {}),
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
                  supplierProductId: corrente.id,
                  quantityPacks: quantita,
                  ...snapshot,
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
     * La riga viene aggiornata nello stesso lock della bozza: così id,
     * posizione, nota e motivazione dell'operatore restano intatti, mentre
     * tutti i dati fotografati dell'offerta cambiano insieme oppure non cambia
     * niente.
     */
    async cambiaFornitore(
      userId: string,
      rigaId: string,
      nuovoSupplierProductId: string,
    ): Promise<OrdineCorrente> {
      const orderId = await idBozza(userId);
      await conOrdineBloccato(orderId, async (tx) => {
        const ordine = await tx.order.findFirstOrThrow({
          where: { id: orderId },
          select: {
            lines: {
              select: {
                id: true,
                supplierProductId: true,
                productId: true,
                supplierNameSnapshot: true,
                packQuantitySnapshot: true,
                unitSizeSnapshot: true,
                uomSnapshot: true,
                unitPriceNetSnapshot: true,
                quantityPacks: true,
              },
            },
          },
        });
        const riga = ordine.lines.find((linea) => linea.id === rigaId);
        if (!riga) throw new OrderNotFoundError('Riga non trovata in questo ordine.');
        if (riga.supplierProductId === nuovoSupplierProductId) {
          throw new OrderValidationError('È già questo il fornitore della riga.');
        }
        if (ordine.lines.some((linea) => linea.supplierProductId === nuovoSupplierProductId)) {
          throw new OrderValidationError(
            'Questa offerta è già nell’ordine: modifica quella riga invece di crearne una seconda.',
          );
        }

        // Tutto dentro lo stesso lock della bozza: se la nuova offerta non è
        // valida, la vecchia riga non viene mai rimossa né modificata.
        const offerte = await tx.supplierProduct.findMany({
          where: { id: { in: [riga.supplierProductId, nuovoSupplierProductId] } },
          select: OFFERTA_ORDINE_SELECT,
        });
        const vecchia = offerte.find((o) => o.id === riga.supplierProductId);
        const nuova = offerte.find((o) => o.id === nuovoSupplierProductId);
        if (!nuova || !vecchia) throw new OrderNotFoundError('L’offerta indicata non esiste.');
        richiediOffertaOrdinabile(nuova, 'La nuova offerta');

        if (
          !riga.productId ||
          nuova.productId !== riga.productId ||
          vecchia.productId !== riga.productId
        ) {
          throw new OrderValidationError(
            'Le due offerte non appartengono allo stesso prodotto: il cambio è stato annullato.',
          );
        }

        const ivaOrganizzazione = await ivaPredefinita(tx);
        const prezzoNuovo = prezzoOperativo(nuova, ivaOrganizzazione);
        const cambio = calcolaCambio(
          {
            supplierProductId: vecchia.id,
            supplierName: riga.supplierNameSnapshot,
            prezzoConfezione: riga.unitPriceNetSnapshot.toString(),
            contenutoPerConfezione: contenutoConfezioneFotografato(
              riga.unitSizeSnapshot.toString(),
              riga.uomSnapshot,
              riga.packQuantitySnapshot,
            ),
            pezziPerConfezione: riga.packQuantitySnapshot,
          },
          {
            supplierProductId: nuova.id,
            supplierName: nuova.supplier.name,
            prezzoConfezione: prezzoNuovo.prezzoNetto.toString(),
            contenutoPerConfezione: nuova.contentPerPack.toString(),
            pezziPerConfezione: nuova.packQuantity,
          },
          riga.quantityPacks,
        );
        if (!confezioniValide(cambio.confezioni)) {
          throw new OrderValidationError(
            'Il cambio produrrebbe una quantità non valida: la riga è rimasta invariata.',
          );
        }

        const snapshot = snapshotDaOfferta(nuova, cambio.confezioni, ivaOrganizzazione);
        await tx.order.update({
          where: { id: orderId },
          data: {
            lines: {
              update: {
                where: { id: riga.id },
                data: {
                  supplierProductId: nuova.id,
                  quantityPacks: cambio.confezioni,
                  ...snapshot,
                  // `note` e `overrideReason` non compaiono qui di proposito:
                  // appartengono alla scelta dell'operatore e sopravvivono al
                  // cambio, insieme a id e posizione della riga.
                },
              },
            },
          },
        });
        await ricalcolaTotali(tx, orderId);
      });

      return leggi(orderId);
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

    /**
     * Cosa guardare prima di confermare.
     *
     * Nessuna di queste segnalazioni blocca. Chi ordina sa cose che l'app non
     * sa — che quel fornitore fa un'eccezione, che quelle tre bottiglie
     * servono stasera — e un blocco su un minimo d'ordine impedirebbe proprio
     * l'ordine urgente che si fa comunque. Si dicono, e si va avanti.
     */
    async riepilogo(userId: string): Promise<RiepilogoOrdine> {
      const orderId = await idBozza(userId);
      // `leggi` usa già questa stessa fotografia del confronto per gli avvisi:
      // riusarla evita una seconda query e due giudizi incoerenti se il
      // catalogo cambia nel mezzo della richiesta.
      const offerteConfrontatePerProdotto = new Map<string, number>();
      const ordine = await leggi(orderId, offerteConfrontatePerProdotto);
      const { impostazioni } = await contesto();

      // ── Minimi d'ordine ────────────────────────────────────────────
      const fornitori = await db.supplier.findMany({
        where: { id: { in: ordine.perFornitore.map((g) => g.supplierId) } },
        select: { id: true, name: true, minOrderValue: true },
      });
      const minimiNonRaggiunti = ordine.perFornitore
        .map((gruppo) => {
          const fornitore = fornitori.find((f) => f.id === gruppo.supplierId);
          if (!fornitore?.minOrderValue) return null;
          const minimo = new Decimal(fornitore.minOrderValue.toString());
          const netto = new Decimal(gruppo.netto);
          if (netto.gte(minimo)) return null;
          return {
            supplierId: gruppo.supplierId,
            supplierName: gruppo.supplierName,
            minimo: minimo.toString(),
            netto: netto.toString(),
            manca: minimo.minus(netto).toDecimalPlaces(2).toString(),
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);

      // ── Prezzi cambiati dopo l'aggiunta ────────────────────────────
      //
      // La riga porta il prezzo di quando è nata; il listino può essere
      // cambiato nel frattempo. Confermando si userà quello di adesso, quindi
      // va detto **prima**: un ordine che cambia totale mentre lo si conferma
      // è il modo più veloce per non fidarsi più dei numeri.
      const offerte = await db.supplierProduct.findMany({
        where: { id: { in: ordine.righe.map((r) => r.supplierProductId) } },
        select: OFFERTA_ORDINE_SELECT,
      });
      const perOffertaCorrente = new Map(offerte.map((o) => [o.id, o] as const));
      const priceVersion = versionePrezziOrdine(
        ordine.righe.map((riga) => {
          const offerta = perOffertaCorrente.get(riga.supplierProductId);
          if (offerta) {
            return prezzoVistoDaOfferta(
              offerta,
              riga.id,
              riga.quantityPacks,
              impostazioni.defaultVat,
            );
          }

          // Un'offerta referenziata dalla riga normalmente non può sparire
          // (FK), ma una fotografia completa rende deterministico anche uno
          // stato corrotto e farà comunque fallire la conferma.
          return {
            lineId: riga.id,
            quantityPacks: riga.quantityPacks,
            supplierProductId: riga.supplierProductId,
            supplierId: riga.supplierId,
            productId: riga.productId,
            nameSnapshot: riga.name,
            supplierNameSnapshot: riga.supplierName,
            supplierCodeSnapshot: riga.supplierCode,
            packQuantitySnapshot: riga.packQuantity,
            packagingTypeSnapshot: riga.packagingType,
            unitSizeSnapshot: riga.unitSize,
            uomSnapshot: riga.unitOfMeasure,
            currentPriceId: null,
            priceNet: null,
            vatRate: null,
            unitPriceBasisSnapshot: null,
          };
        }),
      );

      const limiteFermo = new Date();
      limiteFermo.setMonth(limiteFermo.getMonth() - impostazioni.staleMonths);

      const prezziCambiati: RiepilogoOrdine['prezziCambiati'] = [];
      const prezziFermi: RiepilogoOrdine['prezziFermi'] = [];
      for (const riga of ordine.righe) {
        const offerta = perOffertaCorrente.get(riga.supplierProductId);
        const corrente = offerta?.currentPrice;
        if (!offerta || !corrente) continue;

        const adesso = prezzoOperativo(
          offerta as OffertaOrdinabileRecord,
          impostazioni.defaultVat,
        ).prezzoNetto;
        const allora = new Decimal(riga.priceNet);
        if (!adesso.equals(allora)) {
          prezziCambiati.push({
            rigaId: riga.id,
            name: riga.name,
            supplierName: riga.supplierName,
            prezzoAllora: allora.toString(),
            prezzoAdesso: adesso.toString(),
            differenza: adesso.minus(allora).toDecimalPlaces(2).toString(),
          });
        }
        if (corrente.validFrom < limiteFermo) {
          prezziFermi.push({
            rigaId: riga.id,
            name: riga.name,
            supplierName: riga.supplierName,
            valeDa: corrente.validFrom.toISOString(),
          });
        }
      }

      // ── Righe senza confronto ──────────────────────────────────────
      const senzaConfronto = selezionaRigheSenzaConfronto(
        ordine.righe,
        offerteConfrontatePerProdotto,
      ).map((r) => ({ rigaId: r.id, name: r.name, supplierName: r.supplierName }));

      return {
        ordine,
        priceVersion,
        minimiNonRaggiunti,
        prezziCambiati,
        prezziFermi,
        senzaConfronto,
        confermabile: ordine.righe.length > 0,
      };
    },

    /** La nota dell'ordine intero. */
    async scriviNota(userId: string, nota: string | null): Promise<OrdineCorrente> {
      const orderId = await idBozza(userId);
      await conOrdineBloccato(orderId, async (tx) => {
        await tx.order.update({ where: { id: orderId }, data: { note: nota } });
      });
      return leggi(orderId);
    },

    /**
     * Congela l'ordine.
     *
     * ── I prezzi si rileggono adesso ───────────────────────────────
     * Gli snapshot si riscrivono coi prezzi correnti, non con quelli di
     * quando le righe sono nate. Confermare un ordine a prezzi vecchi
     * significherebbe mandare al fornitore un documento che lui non
     * riconosce, e scoprirlo in fattura. Il riepilogo li ha già segnalati:
     * chi conferma sa cosa sta confermando.
     *
     * ── Il doppio invio ────────────────────────────────────────────
     * Due chiamate simultanee risolvono la **stessa** bozza; dentro la
     * transazione la seconda trova lo stato già cambiato e restituisce
     * l'ordine com'è, senza toccare niente e senza errore. Un errore
     * farebbe pensare che la prima non abbia funzionato.
     *
     * ── Il codice ───────────────────────────────────────────────────
     * Si calcola **dentro** la transazione: se la conferma fallisce, il
     * numero non è mai stato preso e non resta un buco in contabilità.
     */
    async conferma(userId: string, input: ConfermaOrdineInput): Promise<EsitoConferma> {
      const versioneVista = new Date(input.updatedAt);
      return transactionForOrganization(
        organizationId,
        async (tx) => {
          // Il lock è anche il confronto ottimistico col riepilogo. Tutte le
          // mutazioni della bozza aggiornano `updatedAt` passando da
          // `conOrdineBloccato`: se un'altra scheda ha cambiato una quantità,
          // questa UPDATE non trova nulla e la conferma si ferma.
          const bloccata = await tx.order.updateMany({
            where: {
              id: input.orderId,
              createdById: userId,
              status: 'DRAFT',
              updatedAt: versioneVista,
            },
            data: { updatedAt: new Date() },
          });

          if (bloccata.count === 0) {
            const esistente = await tx.order.findFirst({
              where: { id: input.orderId, createdById: userId },
              select: {
                id: true,
                status: true,
                code: true,
                confirmedAt: true,
                totalNet: true,
                totalGross: true,
                _count: { select: { lines: true } },
              },
            });
            if (!esistente) throw new OrderNotFoundError('Ordine non trovato.');
            if (esistente.status === 'DRAFT') {
              throw new OrderVersionError(
                'L’ordine è cambiato dopo l’apertura del riepilogo. Ricaricalo e controllalo di nuovo.',
              );
            }
            if (!esistente.code || !esistente.confirmedAt) {
              throw new OrderValidationError(
                'L’ordine non è più una bozza, ma non ha una conferma valida.',
              );
            }

            // Retry sequenziale dopo una risposta persa: l'id della bozza è
            // nel corpo, quindi non si crea una nuova bozza vuota e si torna
            // esattamente allo stesso ordine.
            return {
              orderId: esistente.id,
              code: esistente.code,
              confirmedAt: esistente.confirmedAt.toISOString(),
              righe: esistente._count.lines,
              netto: esistente.totalNet.toString(),
              lordo: esistente.totalGross.toString(),
              giaConfermato: true,
            } satisfies EsitoConferma;
          }

          // Righe, offerte e prezzi vengono riletti **dopo** il lock e dentro
          // ogni tentativo Serializable. Se PostgreSQL ritenta la transazione,
          // non riutilizziamo mai una fotografia presa dal tentativo prima.
          const ordine = await tx.order.findFirstOrThrow({
            where: { id: input.orderId, createdById: userId, status: 'DRAFT' },
            select: {
              id: true,
              lines: {
                select: {
                  id: true,
                  quantityPacks: true,
                  supplierProduct: { select: OFFERTA_ORDINE_SELECT },
                },
                orderBy: { position: 'asc' },
              },
            },
          });
          if (ordine.lines.length === 0) {
            throw new OrderValidationError('L’ordine è vuoto: non c’è niente da confermare.');
          }
          const ivaOrganizzazione = await ivaPredefinita(tx);
          const versionePrezziAttuale = versionePrezziOrdine(
            ordine.lines.map((riga) =>
              prezzoVistoDaOfferta(
                riga.supplierProduct,
                riga.id,
                riga.quantityPacks,
                ivaOrganizzazione,
              ),
            ),
          );
          if (versionePrezziAttuale !== input.priceVersion) {
            throw new OrderVersionError(
              'Uno o più prezzi sono cambiati dopo l’apertura del riepilogo. Ricaricalo e controllali di nuovo.',
            );
          }

          // Gli snapshot, ai prezzi di adesso.
          let netto = new Decimal(0);
          let iva = new Decimal(0);
          for (const riga of ordine.lines) {
            const offerta = riga.supplierProduct;
            richiediOffertaOrdinabile(offerta, `«${offerta.product?.name ?? offerta.rawName}»`);
            if (!confezioniValide(riga.quantityPacks)) {
              throw new OrderValidationError(
                `La quantità di «${offerta.product?.name ?? offerta.rawName}» non è valida.`,
              );
            }
            const snapshot = snapshotDaOfferta(offerta, riga.quantityPacks, ivaOrganizzazione);
            netto = netto.plus(snapshot.lineTotalNet);
            iva = iva.plus(new Decimal(snapshot.lineTotalGross).minus(snapshot.lineTotalNet));

            await tx.order.update({
              where: { id: ordine.id },
              data: {
                lines: {
                  update: {
                    where: { id: riga.id },
                    data: snapshot,
                  },
                },
              },
            });
          }

          // Il codice: massimo dell'anno più uno, calcolato qui dentro.
          const usati = await tx.order.findMany({
            where: { code: { not: null } },
            select: { code: true },
          });
          const confirmedAt = new Date();
          const code = prossimoCodiceOrdine(
            usati.map((o) => o.code),
            confirmedAt,
          );

          await tx.order.update({
            where: { id: ordine.id },
            data: {
              code,
              status: 'CONFIRMED',
              confirmedAt,
              note: input.note ?? null,
              totalNet: netto.toString(),
              totalVat: iva.toString(),
              totalGross: netto.plus(iva).toString(),
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId,
              userId,
              action: 'ORDER_CONFIRMED',
              entityType: 'Order',
              entityId: ordine.id,
              detail: { code, lines: ordine.lines.length },
            },
          });

          return {
            orderId: ordine.id,
            code,
            confirmedAt: confirmedAt.toISOString(),
            righe: ordine.lines.length,
            netto: netto.toString(),
            lordo: netto.plus(iva).toString(),
            giaConfermato: false,
          } satisfies EsitoConferma;
        },
        // Serializable: due conferme simultanee non devono poter prendere lo
        // stesso numero, e il numero si legge e si scrive qui dentro.
        { isolamento: 'serializable', maxAttempts: 5 },
      );
    },

    /**
     * Lo storico, paginato.
     *
     * Le bozze non compaiono: una bozza non è un ordine, è un ordine che non
     * è ancora successo. Mostrarla insieme alle altre farebbe contare due
     * volte la spesa di questo mese.
     */
    async elenco(query: ElencoOrdiniQuery): Promise<ElencoOrdini> {
      const da = query.giorni > 0 ? new Date(Date.now() - query.giorni * 86_400_000) : null;
      const condizioniRighe = condizioniRigheStorico(query);

      const where = {
        status: query.stato === 'tutti' ? { not: 'DRAFT' as const } : query.stato,
        ...(da ? { OR: [{ confirmedAt: { gte: da } }, { createdAt: { gte: da } }] } : {}),
        // La ricerca guarda i **nomi fotografati** nelle righe: cercando
        // «amaretto» si vuole l'ordine in cui c'era l'amaretto, e quel nome
        // sta nello snapshot anche se il prodotto nel frattempo è cambiato.
        ...(condizioniRighe.length > 0 ? { AND: condizioniRighe } : {}),
      };

      const [totale, righe] = await Promise.all([
        db.order.count({ where }),
        db.order.findMany({
          where,
          select: {
            id: true,
            code: true,
            status: true,
            confirmedAt: true,
            cancelledAt: true,
            createdAt: true,
            totalNet: true,
            totalGross: true,
            lines: {
              select: { quantityPacks: true, supplierId: true, supplierNameSnapshot: true },
            },
          },
          orderBy: [{ confirmedAt: 'desc' }, { createdAt: 'desc' }],
          skip: (query.pagina - 1) * query.perPagina,
          take: query.perPagina,
        }),
      ]);

      return {
        items: righe.map((o) => ({
          id: o.id,
          code: o.code,
          status: o.status,
          confirmedAt: o.confirmedAt?.toISOString() ?? null,
          cancelledAt: o.cancelledAt?.toISOString() ?? null,
          createdAt: o.createdAt.toISOString(),
          righe: o.lines.length,
          confezioni: o.lines.reduce((n, l) => n + l.quantityPacks, 0),
          netto: o.totalNet.toString(),
          lordo: o.totalGross.toString(),
          fornitori: [
            ...new Map(
              o.lines.map((l) => [l.supplierId, l.supplierNameSnapshot] as const),
            ).values(),
          ].sort((a, b) => a.localeCompare(b, 'it')),
        })),
        totale,
        pagina: query.pagina,
        perPagina: query.perPagina,
      };
    },

    /**
     * Un ordine congelato.
     *
     * **Solo snapshot.** Nessun `select` qui dentro tocca prodotti, offerte o
     * fornitori: è la ragione per cui gli snapshot esistono, e basta una join
     * di comodo perché un ordine di sei mesi fa cominci a mostrare il nome di
     * oggi.
     */
    async storico(orderId: string): Promise<OrdineStorico | null> {
      const o = await db.order.findFirst({
        where: { id: orderId, status: { not: 'DRAFT' } },
        select: {
          id: true,
          code: true,
          status: true,
          note: true,
          createdAt: true,
          confirmedAt: true,
          cancelledAt: true,
          totalNet: true,
          totalVat: true,
          totalGross: true,
          lines: {
            select: {
              id: true,
              supplierId: true,
              nameSnapshot: true,
              supplierNameSnapshot: true,
              supplierCodeSnapshot: true,
              packQuantitySnapshot: true,
              unitSizeSnapshot: true,
              uomSnapshot: true,
              quantityPacks: true,
              unitPriceNetSnapshot: true,
              lineTotalNet: true,
              note: true,
            },
            orderBy: { position: 'asc' },
          },
        },
      });
      if (!o) return null;

      return {
        id: o.id,
        code: o.code,
        status: o.status,
        note: o.note,
        createdAt: o.createdAt.toISOString(),
        confirmedAt: o.confirmedAt?.toISOString() ?? null,
        cancelledAt: o.cancelledAt?.toISOString() ?? null,
        netto: o.totalNet.toString(),
        iva: o.totalVat.toString(),
        lordo: o.totalGross.toString(),
        perFornitore: raggruppaRigheStoriche(o.lines),
      };
    },

    /**
     * Rimette un ordine vecchio nella bozza, ai prezzi di oggi.
     *
     * Le due cose che rendono «riordina» affidabile invece che comodo:
     *
     *  - i prezzi sono **quelli di adesso**, non quelli fotografati allora:
     *    riordinare a prezzi vecchi darebbe una bozza che cambia totale alla
     *    conferma, e la conferma è dove non si vogliono sorprese;
     *  - ciò che non si può rimettere **si dice**, articolo per articolo. Un
     *    riordino che salta in silenzio tre righe è peggio di uno che
     *    fallisce: la mancanza si scopre alla consegna.
     */
    async riordina(userId: string, orderId: string): Promise<EsitoRiordino> {
      const draftId = await idBozza(userId);

      return conOrdineBloccato(draftId, async (tx) => {
        const vecchio = await tx.order.findFirst({
          where: { id: orderId, status: { not: 'DRAFT' } },
          select: {
            note: true,
            lines: {
              select: {
                supplierProductId: true,
                quantityPacks: true,
                nameSnapshot: true,
                supplierNameSnapshot: true,
                unitPriceNetSnapshot: true,
                note: true,
              },
              orderBy: { position: 'asc' },
            },
          },
        });
        if (!vecchio) throw new OrderNotFoundError('Ordine non trovato.');

        const bozza = await tx.order.findFirstOrThrow({
          where: { id: draftId, status: 'DRAFT' },
          select: { _count: { select: { lines: true } } },
        });
        const offerte = await tx.supplierProduct.findMany({
          where: { id: { in: vecchio.lines.map((linea) => linea.supplierProductId) } },
          select: OFFERTA_ORDINE_SELECT,
        });
        const stato = new Map(offerte.map((offerta) => [offerta.id, offerta] as const));

        const esito: EsitoRiordino = {
          orderId,
          copiate: 0,
          cambiate: [],
          saltate: [],
          bozzaSvuotata: bozza._count.lines > 0,
        };
        const nuove: Array<
          ReturnType<typeof snapshotDaOfferta> & {
            supplierProductId: string;
            quantityPacks: number;
            position: number;
            note: string | null;
          }
        > = [];
        const ivaOrganizzazione = await ivaPredefinita(tx);

        for (const riga of vecchio.lines) {
          const offerta = stato.get(riga.supplierProductId);
          let motivo: string | null = null;
          if (!offerta) motivo = 'l’articolo non è più a catalogo';
          else if (!offerta.active) motivo = 'il fornitore non lo tiene più a listino';
          else if (!offerta.supplier.active) motivo = 'il fornitore non è più attivo';
          else if (!offerta.currentPrice) motivo = 'non ha più un prezzo corrente';
          else if (!confezioniValide(riga.quantityPacks)) motivo = 'la quantità non è più valida';

          if (motivo || !offerta || !offerta.currentPrice) {
            esito.saltate.push({
              name: riga.nameSnapshot,
              supplierName: riga.supplierNameSnapshot,
              motivo: motivo ?? 'non è più ordinabile',
            });
            continue;
          }

          const snapshot = snapshotDaOfferta(
            offerta as OffertaOrdinabileRecord,
            riga.quantityPacks,
            ivaOrganizzazione,
          );
          nuove.push({
            supplierProductId: offerta.id,
            quantityPacks: riga.quantityPacks,
            position: nuove.length,
            note: riga.note,
            ...snapshot,
          });
          esito.copiate += 1;

          const adesso = new Decimal(offerta.currentPrice.priceNet.toString());
          const allora = new Decimal(riga.unitPriceNetSnapshot.toString());
          if (!adesso.equals(allora)) {
            esito.cambiate.push({
              name: riga.nameSnapshot,
              supplierName: riga.supplierNameSnapshot,
              prezzoAllora: allora.toString(),
              prezzoAdesso: adesso.toString(),
              differenza: adesso.minus(allora).toDecimalPlaces(2).toString(),
            });
          }
        }

        // Svuotamento e copia sono una sola scrittura transazionale. Un errore
        // in qualunque riga fa rollback e lascia intatta la bozza precedente.
        await tx.order.update({
          where: { id: draftId },
          data: {
            note: vecchio.note,
            lines: {
              deleteMany: {},
              ...(nuove.length > 0 ? { create: nuove } : {}),
            },
          },
        });
        await ricalcolaTotali(tx, draftId);
        return esito;
      });
    },

    /**
     * Annulla un ordine confermato.
     *
     * Non si cancella: resta, con lo stato che dice cosa è successo. Un ordine
     * sparito lascia un buco nella numerazione e nessun modo di sapere se è
     * stato mandato o no.
     */
    /**
     * Cancella un ordine per davvero: «mi sono sbagliato».
     *
     * ── Perché esiste, visto che c'è «annulla» ──────────────────────────
     * Annullare è la cosa giusta per un ordine **vero** che non si fa più:
     * resta nello storico col suo numero, e la contabilità sa cosa è
     * successo. Ma un ordine confermato per sbaglio trenta secondi fa non è
     * un ordine che non si fa più: è un ordine che non è mai esistito, e
     * lasciarlo lì annullato sporca lo storico di roba che non racconta
     * niente.
     *
     * ── Quello che porta via ────────────────────────────────────────────
     * Righe e documenti, file compresi. I documenti non si possono lasciare
     * orfani: sono PDF che il database non conoscerebbe più e che nessuno
     * andrebbe a cercare a mano.
     *
     * ── Il prezzo, che va detto a chi preme ─────────────────────────────
     * Il numero **torna disponibile**: il codice è «il massimo più uno», e
     * il prossimo ordine si riprenderà il 2026-0003 appena liberato. Se
     * quello vecchio era già stato mandato, il fornitore si troverebbe due
     * documenti diversi con lo stesso numero sopra. Per questo la schermata
     * lo scrive prima di far premere, e per questo «annulla» resta la strada
     * normale.
     */
    async elimina(orderId: string): Promise<{ code: string | null; documenti: number }> {
      const percorsi = await transactionForOrganization(organizationId, async (tx) => {
        const ordine = await tx.order.findFirst({
          where: { id: orderId },
          select: { code: true, documents: { select: { filePath: true } } },
        });
        if (!ordine) throw new OrderNotFoundError('Ordine non trovato.');

        // I figli prima: le cascate ci sarebbero, ma dirlo per esteso rende
        // leggibile cosa sparisce senza aprire lo schema.
        await tx.order.update({
          where: { id: orderId },
          data: { documents: { deleteMany: {} }, lines: { deleteMany: {} } },
        });
        await tx.order.delete({ where: { id: orderId } });
        return { code: ordine.code, percorsi: ordine.documents.map((d) => d.filePath) };
      });

      // I file **dopo** la transazione: cancellarli dentro renderebbe
      // irreversibile un'operazione che il database potrebbe ancora annullare.
      for (const percorso of percorsi.percorsi) {
        await rimuoviDocumento(percorso);
      }
      return { code: percorsi.code, documenti: percorsi.percorsi.length };
    },

    async annulla(userId: string, orderId: string): Promise<OrdineStorico> {
      await transactionForOrganization(
        organizationId,
        async (tx) => {
          const cambiato = await tx.order.updateMany({
            where: { id: orderId, status: { in: ['CONFIRMED', 'SENT', 'RECEIVED'] } },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          });
          if (cambiato.count === 1) {
            await tx.auditLog.create({
              data: {
                organizationId,
                userId,
                action: 'ORDER_CANCELLED',
                entityType: 'Order',
                entityId: orderId,
                detail: {},
              },
            });
            return;
          }

          const o = await tx.order.findFirst({
            where: { id: orderId },
            select: { status: true },
          });
          if (!o) throw new OrderNotFoundError('Ordine non trovato.');
          if (o.status === 'DRAFT') {
            throw new OrderValidationError('Una bozza non si annulla: si svuota.');
          }
          // Già annullato: nessuna riscrittura della data e, soprattutto,
          // nessun secondo audit log su retry o doppio clic.
        },
        { isolamento: 'riga-bloccata' },
      );
      return (await this.storico(orderId))!;
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
