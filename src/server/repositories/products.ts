import 'server-only';

import type {
  CatalogPrice,
  ProductAliasItem,
  ProductDetail,
  ProductListItem,
  ProductListResult,
  ProductSearchResult,
  SupplierOffer,
} from '@/features/products/dto';
import { countComparableOffers } from '@/features/products/dto';
import type {
  AliasInput,
  ProductInput,
  ProductListQuery,
  ProductPatch,
  ProductSearchQuery,
} from '@/features/products/schema';
import { productInputSchema } from '@/features/products/schema';
import { eseguiRicerca, preparaTermine } from '@/server/database/ricerca-catalogo';
import { prismaForOrganization } from '@/server/db';
import { nucleoDescrizione } from '@/server/domain/packaging/parse';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';
import { baseDi, type BaseUnit, type UnitOfMeasure } from '@/server/domain/packaging/units';
import { scegliPrezzoDaMostrare } from '@/server/domain/pricing/catalog-price';
import { mapOffer, OFFER_INCLUDE, type OfferRecord } from './offers';
import { CATEGORY_REF_SELECT, mapCategoryRef, taxonomyRepository } from './taxonomy';

export class ProductNotFoundError extends Error {
  override readonly name = 'ProductNotFoundError';
}

export class ProductConflictError extends Error {
  override readonly name = 'ProductConflictError';
}

export class ProductValidationError extends Error {
  override readonly name = 'ProductValidationError';
  constructor(
    message: string,
    readonly fields: Record<string, string[]>,
  ) {
    super(message);
  }
}

const LIST_SELECT = {
  id: true,
  name: true,
  brand: true,
  category: { select: CATEGORY_REF_SELECT },
  unitSize: true,
  unitOfMeasure: true,
  baseUnit: true,
  normalizedName: true,
  gtin: true,
  notes: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface ProductRecord {
  id: string;
  name: string;
  brand: string | null;
  category: {
    id: string;
    name: string;
    departmentId: string;
    department: { name: string; color: string | null };
  } | null;
  unitSize: { toString(): string };
  unitOfMeasure: string;
  baseUnit: string;
  normalizedName: string;
  gtin: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Il prezzo da mostrare in catalogo si ricava dalle offerte **già caricate**:
 * nessuna query in più, e nessuna dipendenza da `product_best_offer`, che è
 * un dato derivato e ricalcolato solo dopo un import. Se il catalogo leggesse
 * quella tabella, un prezzo modificato a mano resterebbe vecchio in elenco e
 * nuovo nella scheda — senza che nulla lo segnali.
 *
 * La scelta di *quale* offerta mostrare sta nel dominio, ed è la stessa
 * regola che usa il confronto fra fornitori.
 */
function mapPrice(offers: readonly SupplierOffer[]): CatalogPrice | null {
  const scelta = scegliPrezzoDaMostrare(
    offers.map((o) => ({
      id: o.id,
      attiva: o.active,
      prezzoNetto: o.price?.priceNet ?? null,
      contenutoPerConfezione: o.contentPerPack,
      base: o.baseUnit as BaseUnit,
      confezioneCerta: o.packQuantityConfirmed,
    })),
  );
  if (!scelta) return null;

  const offerta = offers.find((o) => o.id === scelta.id)!;
  const certa = offerta.packQuantityConfirmed;
  return {
    supplierProductId: offerta.id,
    supplierName: offerta.supplierName,
    priceNet: offerta.price!.priceNet,
    // Il prezzo per unità esiste solo se la confezione è dichiarata: senza,
    // sarebbe calcolato su un numero inventato e sembrerebbe un dato vero.
    unitPrice: certa ? offerta.price!.unitPrice : null,
    unitPriceBasis: certa ? offerta.price!.unitPriceBasis : null,
    packQuantity: offerta.packQuantity,
    packagingType: offerta.packagingType,
    unitSize: offerta.unitSize,
    unitOfMeasure: offerta.unitOfMeasure,
    packQuantityConfirmed: certa,
    offersWithPrice: scelta.conPrezzo,
    compared: scelta.confrontato,
    savingPct: scelta.risparmioPct?.toString() ?? null,
  };
}

function mapList(record: ProductRecord, offers: SupplierOffer[]): ProductListItem {
  return {
    id: record.id,
    name: record.name,
    brand: record.brand,
    category: mapCategoryRef(record.category),
    unitSize: record.unitSize.toString(),
    unitOfMeasure: record.unitOfMeasure as ProductListItem['unitOfMeasure'],
    baseUnit: record.baseUnit as ProductListItem['baseUnit'],
    normalizedName: record.normalizedName,
    gtin: record.gtin,
    notes: record.notes,
    createdBy: record.createdBy as ProductListItem['createdBy'],
    updatedAt: record.updatedAt.toISOString(),
    offersCount: offers.length,
    comparableOffersCount: countComparableOffers(offers),
    price: mapPrice(offers),
    // Solo le offerte di fornitori con uno sconto concordato: sulle altre non
    // c'è niente da dire, e un comando che non serve è un comando che si
    // impara a saltare con l'occhio — anche quando invece serve.
    scontabili: offers
      .filter(
        (o) =>
          o.active &&
          (Number(o.extraDiscountPct ?? 0) > 0 ||
            o.scontoExtraApplicato !== '0' ||
            o.extraDiscountExcluded),
      )
      .map((o) => ({
        supplierProductId: o.id,
        supplierName: o.supplierName,
        pct: o.extraDiscountPct ?? o.scontoExtraApplicato,
        esclusa: o.extraDiscountExcluded,
      })),
  };
}

/**
 * I campi derivati non si accettano mai dal client: si ricalcolano qui, con
 * le funzioni del dominio. Un `baseUnit` arrivato dal browser sarebbe un dato
 * che nessuno ha verificato, e basterebbe una volta sbagliata perché due
 * prodotti identici non si confrontino più.
 */
function derivati(input: { name: string; unitOfMeasure: string }) {
  const unita = input.unitOfMeasure as UnitOfMeasure;
  return {
    baseUnit: baseDi(unita),
    normalizedName: nucleoDescrizione(input.name) || normalizzaTesto(input.name) || 'senza nome',
  };
}

export function productsRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);
  const tassonomia = taxonomyRepository(organizationId);

  async function caricaOfferte(
    productIds: readonly string[],
  ): Promise<Map<string, SupplierOffer[]>> {
    if (productIds.length === 0) return new Map();
    const offerte = (await db.supplierProduct.findMany({
      where: { productId: { in: [...productIds] } },
      ...OFFER_INCLUDE,
      orderBy: [{ supplier: { name: 'asc' } }, { rawName: 'asc' }],
    })) as unknown as OfferRecord[];

    const perProdotto = new Map<string, SupplierOffer[]>();
    for (const offerta of offerte) {
      if (!offerta.productId) continue;
      const elenco = perProdotto.get(offerta.productId) ?? [];
      elenco.push(mapOffer(offerta));
      perProdotto.set(offerta.productId, elenco);
    }
    return perProdotto;
  }

  return {
    async list(query: ProductListQuery): Promise<ProductListResult> {
      const termine = normalizzaTesto(query.q);
      const filtroTassonomia =
        query.classification === 'unclassified'
          ? { categoryId: null }
          : query.categoryId
            ? { categoryId: query.categoryId }
            : query.departmentId
              ? { category: { departmentId: query.departmentId } }
              : query.classification === 'classified'
                ? { categoryId: { not: null } }
                : {};

      const where = {
        ...(termine ? { normalizedName: { contains: termine } } : {}),
        // «Da classificare» non può appartenere anche a un reparto: quando
        // arriva insieme a un filtro tassonomico vince e mostra tutta la coda.
        // Negli altri casi la categoria puntuale vince sul reparto.
        ...filtroTassonomia,
        ...(query.status === 'linked' ? { supplierProducts: { some: {} } } : {}),
        ...(query.status === 'orphan' ? { supplierProducts: { none: {} } } : {}),
        ...(query.supplierId
          ? { supplierProducts: { some: { supplierId: query.supplierId, active: true } } }
          : {}),
        // Basta un'offerta senza pezzi dichiarati: è quella che tiene il
        // prodotto fuori dai confronti, anche se le altre sono a posto.
        ...(query.packaging === 'da-definire'
          ? { supplierProducts: { some: { active: true, packQuantityConfirmed: false } } }
          : {}),
      };

      // L'ordinamento per numero di offerte si fa **in SQL**. Prima si
      // ordinava in memoria sulla pagina già caricata: senza paginazione era
      // una scorciatoia innocua, con la paginazione diventa una bugia — ogni
      // pagina ordinata al suo interno e l'insieme in disordine, col prodotto
      // che ha più offerte magari a pagina quattro.
      const ordine =
        query.sort === 'name-desc'
          ? [{ name: 'desc' as const }]
          : query.sort === 'updated-desc'
            ? [{ updatedAt: 'desc' as const }]
            : query.sort === 'offers-desc'
              ? [
                  { supplierProducts: { _count: 'desc' as const } },
                  // A parità di offerte l'ordine deve restare stabile fra una
                  // pagina e l'altra, o un prodotto può comparire due volte.
                  { name: 'asc' as const },
                ]
              : [{ name: 'asc' as const }];

      const salto = (query.pagina - 1) * query.perPagina;

      const [records, total, filtrati, linked, nonClassificati] = await Promise.all([
        db.product.findMany({
          where,
          select: LIST_SELECT,
          orderBy: ordine,
          skip: salto,
          take: query.perPagina,
        }),
        db.product.count({}),
        db.product.count({ where }),
        db.product.count({ where: { supplierProducts: { some: {} } } }),
        db.product.count({ where: { categoryId: null } }),
      ]);

      const offerte = await caricaOfferte(records.map((r) => r.id));
      const items = (records as unknown as ProductRecord[]).map((r) =>
        mapList(r, offerte.get(r.id) ?? []),
      );

      return {
        items,
        total,
        filtrati,
        pagina: query.pagina,
        perPagina: query.perPagina,
        linked,
        orphan: total - linked,
        unclassified: nonClassificati,
      };
    },

    async get(id: string): Promise<ProductDetail | null> {
      const record = (await db.product.findFirst({
        where: { id },
        select: LIST_SELECT,
      })) as ProductRecord | null;
      if (!record) return null;

      const [offerteRaw, aliasRaw] = await Promise.all([
        db.product.findFirst({
          where: { id },
          select: { supplierProducts: { ...OFFER_INCLUDE, orderBy: { rawName: 'asc' } } },
        }),
        db.product.findFirst({
          where: { id },
          select: {
            aliases: {
              orderBy: [{ negative: 'asc' }, { text: 'asc' }],
              select: {
                id: true,
                text: true,
                normalizedText: true,
                source: true,
                negative: true,
                supplierId: true,
                createdAt: true,
              },
            },
          },
        }),
      ]);

      const offers = ((offerteRaw?.supplierProducts ?? []) as unknown as OfferRecord[]).map(
        mapOffer,
      );
      const aliases: ProductAliasItem[] = (aliasRaw?.aliases ?? []).map((a) => ({
        id: a.id,
        text: a.text,
        normalizedText: a.normalizedText,
        source: a.source as ProductAliasItem['source'],
        negative: a.negative,
        supplierId: a.supplierId,
        createdAt: a.createdAt.toISOString(),
      }));

      return {
        ...mapList(record, offers),
        createdAt: record.createdAt.toISOString(),
        offers,
        aliases,
      };
    },

    /**
     * Ricerca per la barra: nome canonico, alias, nome del fornitore e codice
     * articolo. Restituisce anche il tempo impiegato, perché il criterio
     * della fase è un numero e va poter essere misurato dall'esterno.
     */
    async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
      const termine = preparaTermine(query.q);
      if (!termine.normalizzato) {
        return { items: [], normalized: '', strategy: termine.strategia, elapsedMs: 0 };
      }

      const inizio = performance.now();
      const righe = await eseguiRicerca(organizationId, termine, query.limite);
      const elapsedMs = Math.round((performance.now() - inizio) * 100) / 100;

      return {
        items: righe.map((r) => ({
          id: r.id,
          name: r.name,
          brand: r.brand,
          category: r.category_id
            ? {
                id: r.category_id,
                name: r.category_name ?? '',
                departmentId: r.department_id ?? '',
                departmentName: r.department_name ?? '',
                departmentColor: r.department_color,
              }
            : null,
          unitSize: r.unit_size,
          unitOfMeasure: r.unit_of_measure as ProductListItem['unitOfMeasure'],
          offersCount: r.offers_count,
          score: Math.round(r.score * 1000) / 1000,
          via: r.via as ProductSearchResult['items'][number]['via'],
        })),
        normalized: termine.normalizzato,
        strategy: termine.strategia,
        elapsedMs,
      };
    },

    async create(input: ProductInput): Promise<ProductDetail> {
      const dati = { ...input, ...derivati(input) };
      // Una categoria di un'altra organizzazione non esiste, per costruzione
      // dello scope: l'API la traduce in un errore del campo invece di
      // arrivare alla foreign key e uscire come errore 500.
      const categoryId = await tassonomia.assertCategoryBelongs(dati.categoryId);
      const gemello = await db.product.findFirst({
        where: {
          normalizedName: dati.normalizedName,
          unitSize: input.unitSize,
          unitOfMeasure: input.unitOfMeasure,
        },
        select: { id: true, name: true },
      });
      if (gemello) {
        throw new ProductConflictError(
          `Esiste già un prodotto con lo stesso nome e formato: «${gemello.name}».`,
        );
      }

      const creato = await db.product.create({
        data: {
          // Lo scope lo verifica; passarlo esplicito e la convenzione
          // dei repository, cosi il tipo Prisma resta soddisfatto.
          organizationId,
          name: dati.name,
          brand: dati.brand,
          categoryId,
          gtin: dati.gtin,
          notes: dati.notes,
          unitSize: dati.unitSize,
          unitOfMeasure: dati.unitOfMeasure,
          baseUnit: dati.baseUnit,
          normalizedName: dati.normalizedName,
          createdBy: 'USER',
        },
        select: { id: true },
      });

      const dettaglio = await this.get(creato.id);
      if (!dettaglio) throw new ProductNotFoundError('Prodotto non trovato dopo la creazione.');
      return dettaglio;
    },

    async update(id: string, patch: ProductPatch): Promise<ProductDetail> {
      const corrente = (await db.product.findFirst({
        where: { id },
        select: LIST_SELECT,
      })) as ProductRecord | null;
      if (!corrente) throw new ProductNotFoundError('Prodotto non trovato.');

      const fuso = {
        name: patch.name ?? corrente.name,
        brand: patch.brand !== undefined ? patch.brand : corrente.brand,
        categoryId:
          patch.categoryId !== undefined ? patch.categoryId : (corrente.category?.id ?? null),
        gtin: patch.gtin !== undefined ? patch.gtin : corrente.gtin,
        notes: patch.notes !== undefined ? patch.notes : corrente.notes,
        unitSize: patch.unitSize ?? corrente.unitSize.toString(),
        unitOfMeasure: patch.unitOfMeasure ?? corrente.unitOfMeasure,
      };

      const completo = productInputSchema.safeParse(fuso);
      if (!completo.success) {
        const fields: Record<string, string[]> = {};
        for (const issue of completo.error.issues) {
          const campo = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
          (fields[campo] ??= []).push(issue.message);
        }
        throw new ProductValidationError('I dati del prodotto non sono validi.', fields);
      }

      const dati = { ...completo.data, ...derivati(completo.data) };
      const categoryId = await tassonomia.assertCategoryBelongs(dati.categoryId);
      await db.product.update({
        where: { id },
        data: {
          name: dati.name,
          brand: dati.brand,
          categoryId,
          gtin: dati.gtin,
          notes: dati.notes,
          unitSize: dati.unitSize,
          unitOfMeasure: dati.unitOfMeasure,
          baseUnit: dati.baseUnit,
          normalizedName: dati.normalizedName,
        },
      });

      const dettaglio = await this.get(id);
      if (!dettaglio) throw new ProductNotFoundError('Prodotto non trovato.');
      return dettaglio;
    },

    /**
     * Un prodotto con offerte collegate non si cancella: si scollegano prima
     * le offerte, che restano e tornano nella coda «da abbinare». Cancellare
     * a cascata porterebbe via con sé lo storico prezzi.
     */
    async delete(id: string): Promise<void> {
      const conteggio = await db.supplierProduct.count({ where: { productId: id } });
      if (conteggio > 0) {
        throw new ProductConflictError(
          `Il prodotto ha ${conteggio} offerte collegate: scollegale prima di eliminarlo.`,
        );
      }
      const eliminati = await db.product.deleteMany({ where: { id } });
      if (eliminati.count === 0) throw new ProductNotFoundError('Prodotto non trovato.');
    },

    async addAlias(productId: string, input: AliasInput): Promise<ProductAliasItem[]> {
      const prodotto = await db.product.findFirst({
        where: { id: productId },
        select: { id: true },
      });
      if (!prodotto) throw new ProductNotFoundError('Prodotto non trovato.');

      const normalizedText = normalizzaTesto(input.text);
      if (!normalizedText) {
        throw new ProductValidationError('Il sinonimo non è valido.', {
          text: ['Il sinonimo non contiene caratteri utili alla ricerca.'],
        });
      }

      await db.product.update({
        where: { id: productId },
        data: {
          aliases: {
            upsert: {
              where: { productId_normalizedText: { productId, normalizedText } },
              create: {
                text: input.text,
                normalizedText,
                source: 'USER',
                negative: input.negative,
              },
              update: { text: input.text, negative: input.negative },
            },
          },
        },
      });

      const dettaglio = await this.get(productId);
      return dettaglio?.aliases ?? [];
    },

    async removeAlias(productId: string, aliasId: string): Promise<ProductAliasItem[]> {
      await db.product.update({
        where: { id: productId },
        data: { aliases: { deleteMany: { id: aliasId } } },
      });
      const dettaglio = await this.get(productId);
      if (!dettaglio) throw new ProductNotFoundError('Prodotto non trovato.');
      return dettaglio.aliases;
    },
  };
}
