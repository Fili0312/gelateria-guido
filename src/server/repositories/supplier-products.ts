import 'server-only';

import type { SupplierProductListItem, SupplierProductListResult } from '@/features/products/dto';
import type {
  SupplierProductInput,
  SupplierProductPatch,
  SupplierProductListQuery,
} from '@/features/products/schema';
import { supplierProductInputSchema } from '@/features/products/schema';
import { prismaForOrganization, transactionForOrganization } from '@/server/db';
import { impronta } from '@/server/domain/packaging/fingerprint';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';
import { nucleoDescrizione } from '@/server/domain/packaging/parse';
import {
  baseDi,
  inUnitaBase,
  type BaseUnit,
  type UnitOfMeasure,
} from '@/server/domain/packaging/units';
import { prezzoPerUnita } from '@/server/domain/pricing/unit-price';
import { mapOffer, OFFER_INCLUDE, type OfferRecord } from './offers';

export class SupplierProductNotFoundError extends Error {
  override readonly name = 'SupplierProductNotFoundError';
}

export class SupplierProductConflictError extends Error {
  override readonly name = 'SupplierProductConflictError';
}

export class SupplierProductValidationError extends Error {
  override readonly name = 'SupplierProductValidationError';
  constructor(
    message: string,
    readonly fields: Record<string, string[]>,
  ) {
    super(message);
  }
}

/**
 * I campi derivati, calcolati con le funzioni del dominio della Fase 2.
 *
 * Non arrivano mai dal client: `contentPerPack` è il denominatore di ogni
 * confronto di prezzo, e un valore sbagliato non produrrebbe un errore ma un
 * prezzo al litro plausibile e falso — l'unico tipo di guasto che nessuno
 * nota.
 */
export function derivatiOfferta(input: {
  rawName: string;
  unitSize: string;
  unitOfMeasure: string;
  packQuantity: number;
}) {
  const unita = input.unitOfMeasure as UnitOfMeasure;
  const normalizedName =
    nucleoDescrizione(input.rawName) || normalizzaTesto(input.rawName) || 'senza nome';
  const contentPerPack = inUnitaBase(input.unitSize, unita).mul(input.packQuantity);

  return {
    normalizedName,
    baseUnit: baseDi(unita),
    contentPerPack: contentPerPack.toString(),
    fingerprint: impronta({
      nucleo: normalizedName,
      unitSize: input.unitSize,
      unitOfMeasure: unita,
      packQuantity: input.packQuantity,
    }),
  };
}

function campiZod(issues: { path: PropertyKey[]; message: string }[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const campo = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
    (fields[campo] ??= []).push(issue.message);
  }
  return fields;
}

export interface GruppoDaDefinire {
  supplierId: string;
  supplierName: string;
  packagingType: string | null;
  unitSize: string;
  unitOfMeasure: string;
  quante: number;
  /** Qualche nome, per capire di cosa si sta parlando senza aprire niente. */
  esempi: string[];
}

export function supplierProductsRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  async function leggi(id: string): Promise<SupplierProductListItem> {
    const record = (await db.supplierProduct.findFirst({
      where: { id },
      select: { ...OFFER_INCLUDE.select, product: { select: { name: true } } },
    })) as (OfferRecord & { product: { name: string } | null }) | null;
    if (!record) throw new SupplierProductNotFoundError('Prodotto fornitore non trovato.');
    return { ...mapOffer(record), productName: record.product?.name ?? null };
  }

  return {
    /**
     * Le confezioni ancora da dichiarare, raggruppate.
     *
     * Non una per una: i fornitori usano una convenzione, non un capriccio
     * per articolo. «Il collo di bottiglie da 20 cl di cecconi» è una
     * decisione sola che ne sblocca dodici, e chiederla dodici volte fa
     * abbandonare a metà.
     */
    async gruppiDaDefinire(): Promise<GruppoDaDefinire[]> {
      const offerte = await db.supplierProduct.findMany({
        where: { active: true, packQuantityConfirmed: false },
        select: {
          rawName: true,
          packagingType: true,
          unitSize: true,
          unitOfMeasure: true,
          supplierId: true,
          supplier: { select: { name: true } },
        },
        orderBy: { rawName: 'asc' },
      });

      const gruppi = new Map<string, GruppoDaDefinire>();
      for (const o of offerte) {
        const chiave = `${o.supplierId}|${o.packagingType ?? ''}|${o.unitSize.toString()}|${o.unitOfMeasure}`;
        const gruppo = gruppi.get(chiave) ?? {
          supplierId: o.supplierId,
          supplierName: o.supplier.name,
          packagingType: o.packagingType,
          unitSize: o.unitSize.toString(),
          unitOfMeasure: o.unitOfMeasure,
          quante: 0,
          esempi: [],
        };
        gruppo.quante += 1;
        if (gruppo.esempi.length < 3) gruppo.esempi.push(o.rawName);
        gruppi.set(chiave, gruppo);
      }
      return [...gruppi.values()].sort((a, b) => b.quante - a.quante);
    },

    /**
     * Dichiara quanti pezzi contiene la confezione, per un gruppo intero.
     *
     * ── Perché qui si può toccare il contenuto e altrove no ────────────
     * L'aggiornamento normale rifiuta di cambiare il contenuto di
     * un'offerta che ha uno storico prezzi, e fa bene: il prezzo unitario di
     * ogni riga è una fotografia calcolata col contenuto di allora, e
     * cambiare il denominatore dopo farebbe apparire quel valore accanto a un
     * formato che non lo ha prodotto.
     *
     * Qui è il caso opposto, ed è l'unico. `packQuantityConfirmed = false`
     * vuol dire che **quel contenuto non lo sapevamo**: il pezzo per
     * confezione era un ripiego a 1, e ogni unitario calcolato sopra era un
     * segnaposto, non una misura. Correggerlo non riscrive la storia, la
     * completa — ed è la ragione per cui l'app quegli unitari non li mostrava
     * nemmeno, scrivendo «confezione da definire».
     *
     * Per questo si ricalcolano **tutte** le righe di storico e non solo
     * l'ultima: condividevano tutte la stessa ipotesi sbagliata.
     */
    async definisciConfezione(
      chiave: {
        supplierId: string;
        packagingType: string | null;
        unitSize: string;
        unitOfMeasure: string;
      },
      pezzi: number,
    ): Promise<{ offerte: number; prezziRicalcolati: number }> {
      if (!Number.isInteger(pezzi) || pezzi < 1 || pezzi > 10_000) {
        throw new SupplierProductValidationError('I pezzi per confezione non sono validi.', {
          pezzi: ['Indica un numero intero fra 1 e 10.000.'],
        });
      }

      return transactionForOrganization(organizationId, async (tx) => {
        const offerte = await tx.supplierProduct.findMany({
          where: {
            supplierId: chiave.supplierId,
            packagingType: chiave.packagingType,
            unitSize: chiave.unitSize,
            unitOfMeasure: chiave.unitOfMeasure as UnitOfMeasure,
            active: true,
            // Solo quelle mai dichiarate: un'offerta già confermata è una
            // misura, e va cambiata dalla strada stretta.
            packQuantityConfirmed: false,
          },
          select: {
            id: true,
            rawName: true,
            unitSize: true,
            unitOfMeasure: true,
            prices: { select: { id: true, priceNet: true } },
          },
        });

        let prezziRicalcolati = 0;
        for (const offerta of offerte) {
          const derivati = derivatiOfferta({
            rawName: offerta.rawName,
            unitSize: offerta.unitSize.toString(),
            unitOfMeasure: offerta.unitOfMeasure,
            packQuantity: pezzi,
          });

          // I prezzi si aggiornano **annidati** dall'offerta: il client
          // scoped nasconde `supplierProductPrice`, che non ha
          // l'organizzazione addosso. È scomodo e voluto — una query sui
          // prezzi che si dimentica di filtrare non compila.
          const ricalcolati = offerta.prices.map((prezzo) => {
            const unitario = prezzoPerUnita(
              prezzo.priceNet.toString(),
              derivati.contentPerPack,
              derivati.baseUnit as BaseUnit,
            );
            return {
              where: { id: prezzo.id },
              data: {
                unitPrice: unitario.valore.toString(),
                unitPriceBasis: unitario.basis,
              },
            };
          });

          await tx.supplierProduct.update({
            where: { id: offerta.id },
            data: {
              packQuantity: pezzi,
              packQuantityConfirmed: true,
              contentPerPack: derivati.contentPerPack,
              baseUnit: derivati.baseUnit as 'PIECE' | 'KG' | 'L',
              fingerprint: derivati.fingerprint,
              prices: { update: ricalcolati },
            },
          });
          prezziRicalcolati += ricalcolati.length;
        }

        return { offerte: offerte.length, prezziRicalcolati };
      });
    },

    async list(query: SupplierProductListQuery): Promise<SupplierProductListResult> {
      const termine = normalizzaTesto(query.q);
      const where = {
        ...(termine ? { normalizedName: { contains: termine } } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.status === 'linked' ? { productId: { not: null } } : {}),
        ...(query.status === 'orphan' ? { productId: null } : {}),
      };

      const [records, total, linked] = await Promise.all([
        db.supplierProduct.findMany({
          where,
          select: { ...OFFER_INCLUDE.select, product: { select: { name: true } } },
          orderBy: [{ supplier: { name: 'asc' } }, { rawName: 'asc' }],
          take: 300,
        }),
        db.supplierProduct.count({}),
        db.supplierProduct.count({ where: { productId: { not: null } } }),
      ]);

      const items = (
        records as unknown as (OfferRecord & { product: { name: string } | null })[]
      ).map((r) => ({ ...mapOffer(r), productName: r.product?.name ?? null }));

      return { items, total, linked, orphan: total - linked };
    },

    get: leggi,

    async create(input: SupplierProductInput): Promise<SupplierProductListItem> {
      const derivati = derivatiOfferta(input);

      const fornitore = await db.supplier.findFirst({
        where: { id: input.supplierId },
        select: { id: true },
      });
      if (!fornitore) {
        throw new SupplierProductValidationError('Il fornitore indicato non esiste.', {
          supplierId: ['Fornitore non trovato.'],
        });
      }

      if (input.productId) {
        const prodotto = await db.product.findFirst({
          where: { id: input.productId },
          select: { id: true },
        });
        if (!prodotto) {
          throw new SupplierProductValidationError('Il prodotto indicato non esiste.', {
            productId: ['Prodotto non trovato.'],
          });
        }
      }

      // Il codice del fornitore, quando c'è, è l'identità della riga; quando
      // manca, lo è l'impronta. Il doppione va intercettato prima del vincolo
      // del database, per poter dire *quale* riga esiste già.
      const gemello = await db.supplierProduct.findFirst({
        where: {
          supplierId: input.supplierId,
          ...(input.supplierCode
            ? { supplierCode: input.supplierCode }
            : { fingerprint: derivati.fingerprint }),
        },
        select: { id: true, rawName: true },
      });
      if (gemello) {
        throw new SupplierProductConflictError(
          `Questo fornitore ha già un articolo uguale: «${gemello.rawName}».`,
        );
      }

      const creato = await db.supplierProduct.create({
        data: {
          // Lo scope lo verifica; passarlo esplicito e la convenzione
          // dei repository, cosi il tipo Prisma resta soddisfatto.
          organizationId,
          supplierId: input.supplierId,
          supplierCode: input.supplierCode,
          rawName: input.rawName,
          description: input.description,
          brand: input.brand,
          category: input.category,
          packagingType: input.packagingType,
          packQuantity: input.packQuantity,
          packQuantityConfirmed: input.packQuantityConfirmed,
          extraDiscountExcluded: input.extraDiscountExcluded,
          extraDiscountPct: input.extraDiscountPct,
          unitSize: input.unitSize,
          unitOfMeasure: input.unitOfMeasure,
          vatRate: input.vatRate,
          gtin: input.gtin,
          productId: input.productId,
          matchStatus: input.productId ? 'CONFIRMED' : 'PENDING',
          ...derivati,
        },
        select: { id: true },
      });

      return leggi(creato.id);
    },

    async update(id: string, patch: SupplierProductPatch): Promise<SupplierProductListItem> {
      const corrente = (await db.supplierProduct.findFirst({
        where: { id },
        select: { ...OFFER_INCLUDE.select, _count: { select: { prices: true } } },
      })) as (OfferRecord & { _count: { prices: number } }) | null;
      if (!corrente) throw new SupplierProductNotFoundError('Prodotto fornitore non trovato.');

      const fuso = {
        supplierId: patch.supplierId ?? corrente.supplierId,
        supplierCode: patch.supplierCode !== undefined ? patch.supplierCode : corrente.supplierCode,
        rawName: patch.rawName ?? corrente.rawName,
        description: patch.description !== undefined ? patch.description : corrente.description,
        brand: patch.brand !== undefined ? patch.brand : corrente.brand,
        category: patch.category !== undefined ? patch.category : corrente.category,
        packagingType:
          patch.packagingType !== undefined ? patch.packagingType : corrente.packagingType,
        packQuantity: patch.packQuantity ?? corrente.packQuantity,
        packQuantityConfirmed: patch.packQuantityConfirmed ?? corrente.packQuantityConfirmed,
        extraDiscountExcluded: patch.extraDiscountExcluded ?? corrente.extraDiscountExcluded,
        extraDiscountPct:
          patch.extraDiscountPct !== undefined
            ? patch.extraDiscountPct
            : (corrente.extraDiscountPct?.toString() ?? null),
        unitSize: patch.unitSize ?? corrente.unitSize.toString(),
        unitOfMeasure: patch.unitOfMeasure ?? corrente.unitOfMeasure,
        vatRate:
          patch.vatRate !== undefined ? patch.vatRate : (corrente.vatRate?.toString() ?? null),
        gtin: patch.gtin !== undefined ? patch.gtin : corrente.gtin,
        productId: patch.productId !== undefined ? patch.productId : corrente.productId,
      };

      const completo = supplierProductInputSchema.safeParse(fuso);
      if (!completo.success) {
        throw new SupplierProductValidationError(
          'I dati del prodotto fornitore non sono validi.',
          campiZod(completo.error.issues),
        );
      }

      const dati = completo.data;
      const derivati = derivatiOfferta(dati);

      // Lo unitario nello storico e' una fotografia calcolata col contenuto
      // della confezione al momento del prezzo. Cambiare dopo il denominatore
      // o il fornitore farebbe apparire quel valore accanto a un formato che
      // non lo ha prodotto. La futura correzione dovra' essere atomica e
      // appendere un nuovo snapshot; finche' non esiste, il dato storico
      // viene protetto invece di diventare plausibile ma falso.
      const cambiaIdentitaPrezzo =
        dati.supplierId !== corrente.supplierId ||
        derivati.contentPerPack !== corrente.contentPerPack.toString() ||
        derivati.baseUnit !== corrente.baseUnit;
      if (corrente._count.prices > 0 && cambiaIdentitaPrezzo) {
        throw new SupplierProductConflictError(
          "L'offerta ha uno storico prezzi: fornitore o contenuto della confezione non si possono cambiare senza registrare un nuovo snapshot.",
        );
      }

      await db.supplierProduct.update({
        where: { id },
        data: {
          supplierCode: dati.supplierCode,
          rawName: dati.rawName,
          description: dati.description,
          brand: dati.brand,
          category: dati.category,
          packagingType: dati.packagingType,
          packQuantity: dati.packQuantity,
          packQuantityConfirmed: dati.packQuantityConfirmed,
          extraDiscountExcluded: dati.extraDiscountExcluded,
          extraDiscountPct: dati.extraDiscountPct,
          unitSize: dati.unitSize,
          unitOfMeasure: dati.unitOfMeasure,
          vatRate: dati.vatRate,
          gtin: dati.gtin,
          productId: dati.productId,
          matchStatus: dati.productId ? 'CONFIRMED' : 'PENDING',
          ...derivati,
        },
      });

      return leggi(id);
    },

    /** Collega o scollega un'offerta dal prodotto canonico. */
    async link(id: string, productId: string | null): Promise<SupplierProductListItem> {
      if (productId) {
        const prodotto = await db.product.findFirst({
          where: { id: productId },
          select: { id: true },
        });
        if (!prodotto)
          throw new SupplierProductValidationError('Prodotto non trovato.', {
            productId: ['Prodotto non trovato.'],
          });
      }

      const aggiornati = await db.supplierProduct.updateMany({
        where: { id },
        data: { productId, matchStatus: productId ? 'CONFIRMED' : 'PENDING' },
      });
      if (aggiornati.count === 0) {
        throw new SupplierProductNotFoundError('Prodotto fornitore non trovato.');
      }
      return leggi(id);
    },

    /**
     * Si elimina solo un'offerta senza storico: se ha prezzi, cancellarla
     * porterebbe via lo storico, che è il dato più prezioso dell'applicazione.
     * In quel caso si disattiva.
     */
    async delete(id: string): Promise<void> {
      const record = await db.supplierProduct.findFirst({
        where: { id },
        select: { id: true, _count: { select: { prices: true, orderLines: true } } },
      });
      if (!record) throw new SupplierProductNotFoundError('Prodotto fornitore non trovato.');

      const legami = record._count.prices + record._count.orderLines;
      if (legami > 0) {
        throw new SupplierProductConflictError(
          "L'offerta ha uno storico prezzi o compare in un ordine: si può disattivare, non eliminare.",
        );
      }
      await db.supplierProduct.deleteMany({ where: { id } });
    },

    async setActive(id: string, active: boolean): Promise<SupplierProductListItem> {
      const aggiornati = await db.supplierProduct.updateMany({ where: { id }, data: { active } });
      if (aggiornati.count === 0) {
        throw new SupplierProductNotFoundError('Prodotto fornitore non trovato.');
      }
      return leggi(id);
    },
  };
}
