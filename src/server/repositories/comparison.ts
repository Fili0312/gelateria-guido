import 'server-only';

import { Decimal } from 'decimal.js';
import type {
  ComparedOffer,
  ComparisonReport,
  ComparisonRow,
  ComparisonSort,
  ExcludedOffer,
} from '@/features/reports/dto';
import { SETTINGS_ALL_KEYS, valoriDaRighe } from '@/features/settings/schema';
import { prismaForOrganization } from '@/server/db';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';
import type { BaseUnit } from '@/server/domain/packaging/units';
import { confrontaProdotto, meritaAvviso } from '@/server/domain/pricing/comparison';
import { nettoEffettivo, percentualeApplicata } from '@/server/domain/pricing/extra-discount';
import { risolviAliquotaIva } from '@/server/domain/pricing/vat';
import { CATEGORY_REF_SELECT, mapCategoryRef } from './taxonomy';
import { settingsRepository } from './settings';

/**
 * Il report «dove conviene comprarlo».
 *
 * Si calcola **in diretta** dalle offerte, non da `product_best_offer`.
 * Quella tabella è denormalizzata per la schermata ordine, dove il confronto
 * va letto per ogni riga di risultato mentre si digita; qui, su una pagina
 * sola, una query e un po' di aritmetica costano meno di un dato che può
 * essere vecchio. E soprattutto: le soglie e i mesi oltre i quali un prezzo è
 * fermo si applicano **adesso**, mentre `product_best_offer` congela il
 * giudizio al momento dell'import — un prezzo diventerebbe fermo senza che
 * niente lo ricalcoli.
 */

export interface ComparisonQuery {
  q?: string;
  departmentId?: string;
  categoryId?: string;
  /** Filtra sui prodotti in cui **questo** fornitore è il più conveniente. */
  bestSupplierId?: string;
  /** Solo i confronti che superano entrambe le soglie. */
  onlyAlert?: boolean;
  sort?: ComparisonSort;
}

const OFFERTE_SELECT = {
  id: true,
  supplierId: true,
  supplierCode: true,
  rawName: true,
  vatRate: true,
  extraDiscountExcluded: true,
  extraDiscountPct: true,
  packQuantity: true,
  packQuantityConfirmed: true,
  packagingType: true,
  unitSize: true,
  unitOfMeasure: true,
  contentPerPack: true,
  baseUnit: true,
  active: true,
  supplier: {
    select: { name: true, extraDiscountPct: true, defaultVatRate: true },
  },
  currentPrice: {
    select: {
      priceNet: true,
      vatRate: true,
      unitPrice: true,
      unitPriceBasis: true,
      validFrom: true,
    },
  },
} as const;

type OffertaRecord = {
  id: string;
  supplierId: string;
  supplierCode: string | null;
  rawName: string;
  vatRate: { toString(): string } | null;
  extraDiscountExcluded: boolean;
  extraDiscountPct: { toString(): string } | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
  packagingType: string | null;
  unitSize: { toString(): string };
  unitOfMeasure: string;
  contentPerPack: { toString(): string };
  baseUnit: string;
  active: boolean;
  supplier: {
    name: string;
    extraDiscountPct: { toString(): string } | null;
    defaultVatRate: { toString(): string } | null;
  };
  currentPrice: {
    priceNet: { toString(): string };
    vatRate: { toString(): string } | null;
    unitPrice: { toString(): string };
    unitPriceBasis: string;
    validFrom: Date;
  } | null;
};

/** Lo sconto extra di un'offerta, nella forma che il dominio si aspetta. */
function scontoDi(o: OffertaRecord) {
  return {
    percentualeFornitore: o.supplier.extraDiscountPct?.toString() ?? null,
    esclusa: o.extraDiscountExcluded,
    percentualeSua: o.extraDiscountPct?.toString() ?? null,
  };
}

function mapOfferta(o: OffertaRecord, fermo: boolean, defaultVat: number): ComparedOffer {
  const sconto = scontoDi(o);
  const netto = o.currentPrice!.priceNet.toString();
  return {
    supplierProductId: o.id,
    supplierId: o.supplierId,
    supplierName: o.supplier.name,
    supplierCode: o.supplierCode,
    rawName: o.rawName,
    priceNet: netto,
    priceEffective: nettoEffettivo(netto, sconto).toString(),
    extraDiscountPct: percentualeApplicata(sconto).toString(),
    unitPrice: o.currentPrice!.unitPrice.toString(),
    unitPriceBasis: o.currentPrice!.unitPriceBasis as ComparedOffer['unitPriceBasis'],
    packQuantity: o.packQuantity,
    packagingType: o.packagingType,
    unitSize: o.unitSize.toString(),
    unitOfMeasure: o.unitOfMeasure as ComparedOffer['unitOfMeasure'],
    contentPerPack: o.contentPerPack.toString(),
    baseUnit: o.baseUnit as ComparedOffer['baseUnit'],
    vatRate: risolviAliquotaIva({
      aliquotaPrezzo: o.currentPrice!.vatRate?.toString() ?? null,
      aliquotaOfferta: o.vatRate?.toString() ?? null,
      aliquotaFornitore: o.supplier.defaultVatRate?.toString() ?? null,
      aliquotaOrganizzazione: defaultVat,
    }).valore.toString(),
    stale: fermo,
    validFrom: o.currentPrice!.validFrom.toISOString(),
  };
}

type ProdottoRecord = {
  id: string;
  name: string;
  brand: string | null;
  unitSize: { toString(): string };
  unitOfMeasure: string;
  category: Parameters<typeof mapCategoryRef>[0];
  supplierProducts: OffertaRecord[];
};

const PRODOTTO_SELECT = {
  id: true,
  name: true,
  brand: true,
  unitSize: true,
  unitOfMeasure: true,
  category: { select: CATEGORY_REF_SELECT },
  supplierProducts: { select: OFFERTE_SELECT },
} as const;

/**
 * Da un prodotto e dalle sue offerte alla riga di confronto.
 *
 * Una funzione sola per il report e per la scheda prodotto: se ognuna
 * ordinasse per conto proprio, l'elenco e la scheda potrebbero indicare
 * fornitori diversi come «più conveniente» — e nessuno dei due sembrerebbe
 * sbagliato guardandolo da solo.
 */
function costruisciRiga(
  prodotto: ProdottoRecord,
  opzioni: Parameters<typeof confrontaProdotto>[1],
  soglie: { percentuale: number; euro: number },
  defaultVat: number,
): ComparisonRow {
  const perId = new Map(prodotto.supplierProducts.map((o) => [o.id, o]));
  const esito = confrontaProdotto(
    prodotto.supplierProducts.map((o) => ({
      id: o.id,
      attiva: o.active,
      prezzoNetto: o.currentPrice?.priceNet.toString() ?? null,
      prezzoEffettivo: o.currentPrice
        ? nettoEffettivo(o.currentPrice.priceNet.toString(), scontoDi(o)).toString()
        : null,
      scontoExtraPct: percentualeApplicata(scontoDi(o)).toString(),
      contenutoPerConfezione: o.contentPerPack.toString(),
      base: o.baseUnit as BaseUnit,
      confezioneCerta: o.packQuantityConfirmed,
      valeDa: o.currentPrice?.validFrom ?? null,
    })),
    opzioni,
  );

  const escluse: ExcludedOffer[] = esito.escluse.map((e) => ({
    supplierProductId: e.id,
    supplierName: perId.get(e.id)!.supplier.name,
    reason: e.motivo,
  }));

  return {
    productId: prodotto.id,
    productName: prodotto.name,
    brand: prodotto.brand,
    category: mapCategoryRef(prodotto.category),
    unitSize: prodotto.unitSize.toString(),
    unitOfMeasure: prodotto.unitOfMeasure as ComparisonRow['unitOfMeasure'],
    state: esito.stato,
    reason: esito.motivo,
    best: esito.migliore
      ? mapOfferta(perId.get(esito.migliore.id)!, esito.migliore.fermo, defaultVat)
      : null,
    worst: esito.piuCara
      ? mapOfferta(perId.get(esito.piuCara.id)!, esito.piuCara.fermo, defaultVat)
      : null,
    offersCompared: esito.classifica.length,
    ranked: esito.classifica.map((r) => mapOfferta(perId.get(r.id)!, r.fermo, defaultVat)),
    excluded: escluse,
    unitDifference: esito.differenzaUnitaria?.toString() ?? null,
    savingPerPack: esito.risparmioPerConfezione?.toString() ?? null,
    savingPct: esito.risparmioPct?.toString() ?? null,
    worthAlert: meritaAvviso(esito, soglie),
    anyStale: esito.qualcunoFermo,
  };
}

export function comparisonRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  /** Impostazioni e momento di riferimento: si leggono una volta per richiesta. */
  async function contesto() {
    const impostazioni = valoriDaRighe(
      await settingsRepository(organizationId).findMany(SETTINGS_ALL_KEYS),
    );
    return {
      impostazioni,
      opzioni: { adesso: new Date(), mesiPrimaDiConsiderarloFermo: impostazioni.staleMonths },
      soglie: { percentuale: impostazioni.alertPercentage, euro: impostazioni.alertEuro },
    };
  }

  return {
    /**
     * Il confronto di più prodotti in una query sola.
     *
     * La schermata ordine ne interroga venti a ogni tasto premuto: una query
     * per prodotto sarebbe venti andate e ritorni per battuta, e la ricerca
     * smetterebbe di sembrare istantanea proprio mentre si digita.
     */
    async perProdotti(productIds: readonly string[]): Promise<Map<string, ComparisonRow>> {
      if (productIds.length === 0) return new Map();
      const { impostazioni, opzioni, soglie } = await contesto();
      const prodotti = (await db.product.findMany({
        where: { id: { in: [...productIds] } },
        select: PRODOTTO_SELECT,
      })) as unknown as ProdottoRecord[];
      return new Map(
        prodotti.map(
          (p) => [p.id, costruisciRiga(p, opzioni, soglie, impostazioni.defaultVat)] as const,
        ),
      );
    },

    /** Il confronto di un prodotto solo, con la stessa regola del report. */
    async perProdotto(productId: string): Promise<ComparisonRow | null> {
      const { impostazioni, opzioni, soglie } = await contesto();
      const prodotto = (await db.product.findFirst({
        where: { id: productId },
        select: PRODOTTO_SELECT,
      })) as unknown as ProdottoRecord | null;
      if (!prodotto) return null;
      return costruisciRiga(prodotto, opzioni, soglie, impostazioni.defaultVat);
    },

    async report(query: ComparisonQuery = {}): Promise<ComparisonReport> {
      const { impostazioni, opzioni, soglie } = await contesto();

      const termine = normalizzaTesto(query.q ?? '');
      const prodotti = (await db.product.findMany({
        where: {
          ...(termine ? { normalizedName: { contains: termine } } : {}),
          ...(query.categoryId
            ? { categoryId: query.categoryId }
            : query.departmentId
              ? { category: { departmentId: query.departmentId } }
              : {}),
          // Un prodotto senza nemmeno un'offerta non è «non confrontabile»:
          // non è ancora niente, e affollerebbe l'elenco senza dire nulla.
          supplierProducts: { some: {} },
        },
        select: PRODOTTO_SELECT,
        orderBy: { name: 'asc' },
      })) as unknown as ProdottoRecord[];

      const confronti: ComparisonRow[] = [];
      const senzaConfronto: ComparisonRow[] = [];

      for (const prodotto of prodotti) {
        const riga = costruisciRiga(prodotto, opzioni, soglie, impostazioni.defaultVat);
        if (riga.state === 'CONFRONTATO') confronti.push(riga);
        else senzaConfronto.push(riga);
      }

      // I totali si calcolano **prima** dei filtri di visualizzazione: sono la
      // fotografia del catalogo, e cambierebbero significato se seguissero la
      // ricerca in corso.
      const totals = {
        products: prodotti.length,
        compared: confronti.length,
        singleOffer: senzaConfronto.filter((r) => r.state === 'OFFERTA_UNICA').length,
        notComparable: senzaConfronto.filter((r) => r.state === 'NON_CONFRONTABILE').length,
        withoutPrice: senzaConfronto.filter((r) => r.state === 'SENZA_PREZZO').length,
        worthAlert: confronti.filter((r) => r.worthAlert).length,
        savingPerPack: confronti
          .reduce((somma, r) => somma.plus(r.savingPerPack ?? 0), new Decimal(0))
          .toDecimalPlaces(2)
          .toString(),
        stale: [...confronti, ...senzaConfronto].filter((r) => r.anyStale).length,
      };

      let visibili = confronti;
      if (query.bestSupplierId) {
        visibili = visibili.filter((r) => r.best?.supplierId === query.bestSupplierId);
      }
      if (query.onlyAlert) visibili = visibili.filter((r) => r.worthAlert);

      ordina(visibili, query.sort ?? 'saving-desc');
      ordina(senzaConfronto, 'name-asc');

      return {
        comparisons: visibili,
        withoutComparison: senzaConfronto,
        totals,
        thresholds: {
          percentage: impostazioni.alertPercentage,
          euro: impostazioni.alertEuro,
          staleMonths: impostazioni.staleMonths,
        },
      };
    },
  };
}

/**
 * L'ordine predefinito è per impatto in euro, non per percentuale: il 40% su
 * una bottiglia da mezzo euro sta in cima a un elenco ordinato per
 * percentuale, e non è la cosa da guardare per prima.
 */
function ordina(righe: ComparisonRow[], sort: ComparisonSort): void {
  const perNome = (a: ComparisonRow, b: ComparisonRow) =>
    a.productName.localeCompare(b.productName, 'it');

  if (sort === 'name-asc') {
    righe.sort(perNome);
    return;
  }
  const campo = sort === 'saving-pct-desc' ? 'savingPct' : 'savingPerPack';
  righe.sort((a, b) => {
    const differenza = new Decimal(b[campo] ?? 0).comparedTo(new Decimal(a[campo] ?? 0));
    return differenza !== 0 ? differenza : perNome(a, b);
  });
}
