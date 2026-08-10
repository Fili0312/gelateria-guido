import 'server-only';

import { randomUUID } from 'node:crypto';
import { SETTINGS_ALL_KEYS, valoriDaRighe } from '@/features/settings/schema';
import type {
  PriceHistoryDTO,
  PriceHistoryItem,
  SetManualPriceResult,
  SetPriceResult,
} from '@/features/prices/dto';
import { PriceStorageRangeError, priceValuesForWrite } from '@/features/prices/calculation';
import { businessCalendarDay, isFutureBusinessDay } from '@/features/prices/date';
import {
  calendarDaySchema,
  manualPriceSchema,
  type ManualPriceInput,
  setPriceSchema,
  type SetPriceInput,
  type ValidatedSetPriceInput,
} from '@/features/prices/schema';
import { sameCommercialPrice } from '@/features/prices/snapshot';
import {
  effectiveRowAt,
  isAnnulledRow,
  planTimelineInsertion,
  sortTimeline,
  type TimelineRow,
} from '@/features/prices/timeline';
import { calculateWindowVariations } from '@/features/prices/window-variations';
import {
  prismaForOrganization,
  transactionForOrganization,
  type OrganizationJsonInput,
  type OrganizationPrismaClient,
} from '@/server/db';
import type { BaseUnit } from '@/server/domain/packaging/units';
import { variazione } from '@/server/domain/pricing/history';
import { prezzoPerUnita } from '@/server/domain/pricing/unit-price';
import { normalizzaPrezzoIva, PrezzoIvaError } from '@/server/domain/pricing/vat';

export class PriceHistoryNotFoundError extends Error {
  override readonly name = 'PriceHistoryNotFoundError';
}

export class PriceHistoryValidationError extends Error {
  override readonly name = 'PriceHistoryValidationError';
  constructor(
    message: string,
    readonly fields: Record<string, string[]>,
  ) {
    super(message);
  }
}

const PRICE_SELECT = {
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
  createdAt: true,
} as const;

const HISTORY_SELECT = {
  id: true,
  organizationId: true,
  supplierId: true,
  supplierCode: true,
  rawName: true,
  productId: true,
  packQuantity: true,
  packQuantityConfirmed: true,
  unitSize: true,
  unitOfMeasure: true,
  contentPerPack: true,
  baseUnit: true,
  vatRate: true,
  currentPriceId: true,
  supplier: {
    select: { name: true, pricesIncludeVat: true, defaultVatRate: true },
  },
  product: { select: { id: true, name: true } },
  prices: {
    select: PRICE_SELECT,
    orderBy: [{ validFrom: 'asc' as const }, { createdAt: 'asc' as const }],
  },
};

interface DecimalLike {
  toString(): string;
}

interface PriceRecord {
  id: string;
  priceListId: string | null;
  priceList: DecimalLike;
  discounts: unknown;
  priceNet: DecimalLike;
  vatRate: DecimalLike | null;
  currency: string;
  unitPrice: DecimalLike;
  unitPriceBasis: string;
  validFrom: Date;
  validTo: Date | null;
  source: string;
  createdAt: Date;
}

interface HistoryRecord {
  id: string;
  organizationId: string;
  supplierId: string;
  supplierCode: string | null;
  rawName: string;
  productId: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
  unitSize: DecimalLike;
  unitOfMeasure: string;
  contentPerPack: DecimalLike;
  baseUnit: string;
  vatRate: DecimalLike | null;
  currentPriceId: string | null;
  supplier: {
    name: string;
    pricesIncludeVat: boolean;
    defaultVatRate: DecimalLike | null;
  };
  product: { id: string; name: string } | null;
  prices: PriceRecord[];
}

function fieldsFromIssues(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

function toDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dayToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeRequestedDay(value: Date | string): string {
  const candidate = value instanceof Date && !Number.isNaN(value.valueOf()) ? toDay(value) : value;
  const parsed = calendarDaySchema.safeParse(candidate);
  if (!parsed.success) {
    throw new PriceHistoryValidationError('La data richiesta non e valida.', {
      at: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}

function discountsFromJson(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((discount) => (typeof discount === 'number' ? discount : Number(discount)))
    .filter((discount) => Number.isFinite(discount) && discount > 0 && discount < 100);
}

function timelineRows(record: HistoryRecord): (TimelineRow & { record: PriceRecord })[] {
  return record.prices.map((price) => ({
    id: price.id,
    validFrom: toDay(price.validFrom),
    validTo: price.validTo ? toDay(price.validTo) : null,
    createdAt: price.createdAt.toISOString(),
    record: price,
  }));
}

function mapHistory(record: HistoryRecord, queriedAt: string | null): PriceHistoryDTO {
  let previousEffective: PriceHistoryItem | null = null;
  const prices = sortTimeline(timelineRows(record)).map((timeline): PriceHistoryItem => {
    const price = timeline.record;
    const annulled = isAnnulledRow(timeline);
    const change =
      !annulled && previousEffective
        ? variazione(previousEffective.priceNet, price.priceNet.toString())
        : null;
    const item: PriceHistoryItem = {
      id: price.id,
      priceListId: price.priceListId,
      priceList: price.priceList.toString(),
      discounts: discountsFromJson(price.discounts),
      priceNet: price.priceNet.toString(),
      vatRate: price.vatRate?.toString() ?? null,
      currency: price.currency,
      unitPrice: price.unitPrice.toString(),
      unitPriceBasis: price.unitPriceBasis as PriceHistoryItem['unitPriceBasis'],
      validFrom: timeline.validFrom,
      validTo: timeline.validTo,
      source: price.source as PriceHistoryItem['source'],
      createdAt: timeline.createdAt,
      isCurrent: record.currentPriceId === price.id,
      annulled,
      variation: change
        ? {
            absolute: change.assoluta.toString(),
            percent: change.percentuale.toFixed(2),
            direction: change.direzione,
          }
        : null,
    };
    if (!annulled) previousEffective = item;
    return item;
  });

  return {
    supplierProductId: record.id,
    supplierName: record.supplier.name,
    supplierCode: record.supplierCode,
    rawName: record.rawName,
    productId: record.productId,
    productName: record.product?.name ?? null,
    packQuantity: record.packQuantity,
    packQuantityConfirmed: record.packQuantityConfirmed,
    unitSize: record.unitSize.toString(),
    unitOfMeasure: record.unitOfMeasure as PriceHistoryDTO['unitOfMeasure'],
    contentPerPack: record.contentPerPack.toString(),
    baseUnit: record.baseUnit as PriceHistoryDTO['baseUnit'],
    offerVatRate: record.vatRate?.toString() ?? null,
    currentPriceId: record.currentPriceId,
    prices,
    windowVariations: calculateWindowVariations(prices, businessCalendarDay()),
    queriedAt,
    priceAt: queriedAt ? effectiveRowAt(prices, queriedAt) : null,
  };
}

async function readHistoryRecord(
  db: OrganizationPrismaClient,
  supplierProductId: string,
): Promise<HistoryRecord> {
  const record = (await db.supplierProduct.findFirst({
    where: { id: supplierProductId },
    select: HISTORY_SELECT,
  })) as unknown as HistoryRecord | null;
  if (!record) throw new PriceHistoryNotFoundError('Prodotto fornitore non trovato.');
  return record;
}

function validateManualInput(input: ManualPriceInput): ManualPriceInput {
  const parsed = manualPriceSchema.safeParse(input);
  if (!parsed.success) {
    throw new PriceHistoryValidationError(
      'I dati del prezzo non sono validi.',
      fieldsFromIssues(parsed.error.issues),
    );
  }
  return parsed.data;
}

function validateSetPriceInput(input: SetPriceInput): ValidatedSetPriceInput {
  const parsed = setPriceSchema.safeParse(input);
  if (!parsed.success) {
    throw new PriceHistoryValidationError(
      'I dati del prezzo non sono validi.',
      fieldsFromIssues(parsed.error.issues),
    );
  }
  if (isFutureBusinessDay(parsed.data.validFrom)) {
    throw new PriceHistoryValidationError('La data del prezzo non puo essere futura.', {
      validFrom: [
        'La data non puo essere successiva al giorno corrente della gelateria (Europe/Rome).',
      ],
    });
  }
  return parsed.data;
}

/**
 * Il corpo di `setPrice`, dentro una transazione **gia aperta**.
 *
 * Estratto perche' l'applicazione di un import (Fase 10) deve scrivere
 * decine di prezzi dentro la propria transazione, e le transazioni Prisma
 * non si annidano. L'alternativa era copiare qui la logica temporale: due
 * copie delle stesse regole su periodi di validita e puntatore corrente
 * divergono, e divergerebbero in silenzio.
 */
export async function applicaPrezzoInTransazione(
  tx: OrganizationPrismaClient,
  supplierProductId: string,
  input: SetPriceInput,
  createdById?: string | null,
  contesto?: { defaultVat: number },
): Promise<SetPriceResult> {
  const data = validateSetPriceInput(input);
  const actorId = createdById?.trim() || null;
  if (data.source === 'MANUAL' && !actorId) {
    throw new PriceHistoryValidationError('Un prezzo manuale deve indicare chi lo ha inserito.', {
      _form: ["L'utente che inserisce il prezzo e obbligatorio."],
    });
  }

  const record = await readHistoryRecord(tx, supplierProductId);

  // In sequenza e non con `Promise.all`: dentro una transazione le due
  // query condividono la stessa connessione, e lanciarle insieme e' un uso
  // che `pg` deprecata e che togliera' del tutto. Non si vedeva finche' i
  // prezzi si scrivevano uno alla volta; l'applicazione di un import ne
  // scrive centonovanta di fila.
  const actor = actorId
    ? await tx.user.findFirst({ where: { id: actorId }, select: { id: true } })
    : null;
  const linkedPriceList = data.priceListId
    ? await tx.priceList.findFirst({
        where: { id: data.priceListId, supplierId: record.supplierId },
        select: { id: true, currency: true },
      })
    : null;

  if (actorId && !actor) {
    throw new PriceHistoryValidationError('Utente non valido per questa organizzazione.', {
      _form: ["L'utente che inserisce il prezzo non appartiene all'organizzazione."],
    });
  }
  if (data.priceListId && !linkedPriceList) {
    throw new PriceHistoryValidationError("Il listino non appartiene al fornitore dell'offerta.", {
      priceListId: ['Listino non trovato per questo fornitore.'],
    });
  }

  let values;
  try {
    values = priceValuesForWrite(
      data,
      record.contentPerPack.toString(),
      record.baseUnit as BaseUnit,
    );
  } catch (error) {
    if (!(error instanceof PriceStorageRangeError)) throw error;
    const field =
      error.field === 'priceNet' && data.priceNet === undefined ? 'priceList' : error.field;
    throw new PriceHistoryValidationError('Il prezzo non e memorizzabile.', {
      [field]: [error.message],
    });
  }
  let { net, unit } = values;
  let vatRate: string;
  try {
    const defaultVat =
      contesto?.defaultVat ??
      valoriDaRighe(
        await tx.setting.findMany({
          where: { key: { in: SETTINGS_ALL_KEYS } },
          select: { key: true, value: true },
        }),
      ).defaultVat;
    const normalizzato = normalizzaPrezzoIva({
      prezzoQuotato: net,
      originePrezzo: data.source,
      pricesIncludeVat: record.supplier.pricesIncludeVat,
      aliquotaPrezzo: data.vatRate,
      aliquotaOfferta: record.vatRate?.toString() ?? null,
      aliquotaFornitore: record.supplier.defaultVatRate?.toString() ?? null,
      aliquotaOrganizzazione: defaultVat,
    });
    net = normalizzato.prezzoNetto;
    vatRate = normalizzato.aliquotaIva.toString();
    unit = prezzoPerUnita(net, record.contentPerPack.toString(), record.baseUnit as BaseUnit);
  } catch (error) {
    if (!(error instanceof PrezzoIvaError)) throw error;
    throw new PriceHistoryValidationError('L’IVA del prezzo non è valida.', {
      vatRate: [error.message],
    });
  }
  const currency = linkedPriceList?.currency ?? 'EUR';
  const seenInPriceList =
    data.source === 'PRICE_LIST' && linkedPriceList
      ? {
          lastSeenAt: new Date(),
          lastSeenPriceList: { connect: { id: linkedPriceList.id } },
          active: true,
          disappearedAt: null,
        }
      : {};
  const rows = timelineRows(record);
  const plan = planTimelineInsertion(rows, data.validFrom);
  const effective = plan.effectiveRowId
    ? (rows.find((row) => row.id === plan.effectiveRowId)?.record ?? null)
    : null;

  const nextSnapshot = {
    priceList: data.priceList,
    discounts: data.discounts,
    priceNet: net.toString(),
    vatRate,
    currency,
    unitPrice: unit.valore.toString(),
    unitPriceBasis: unit.basis,
  };
  if (
    effective &&
    sameCommercialPrice(
      {
        priceList: effective.priceList.toString(),
        discounts: discountsFromJson(effective.discounts),
        priceNet: effective.priceNet.toString(),
        vatRate: effective.vatRate?.toString() ?? null,
        currency: effective.currency,
        unitPrice: effective.unitPrice.toString(),
        unitPriceBasis: effective.unitPriceBasis,
      },
      nextSnapshot,
    )
  ) {
    if (data.source === 'PRICE_LIST') {
      await tx.supplierProduct.update({
        where: { id: supplierProductId },
        data: seenInPriceList,
      });
    }
    return { created: false, history: mapHistory(record, null) };
  }

  const newPriceId = randomUUID();
  const validFrom = dayToDate(data.validFrom);
  const validTo = plan.newValidTo ? dayToDate(plan.newValidTo) : null;

  await tx.supplierProduct.update({
    where: { id: supplierProductId },
    data: {
      ...seenInPriceList,
      prices: {
        ...(plan.closeRowId
          ? {
              update: {
                where: { id: plan.closeRowId },
                data: { validTo: validFrom },
              },
            }
          : {}),
        create: {
          id: newPriceId,
          priceList: data.priceList,
          discounts: data.discounts as OrganizationJsonInput,
          priceNet: net.toString(),
          vatRate,
          currency,
          unitPrice: unit.valore.toString(),
          unitPriceBasis: unit.basis,
          validFrom,
          validTo,
          source: data.source,
          ...(actor ? { createdBy: { connect: { id: actor.id } } } : {}),
          ...(linkedPriceList ? { priceListRef: { connect: { id: linkedPriceList.id } } } : {}),
        },
      },
    },
  });

  // Non esistono prezzi pianificati nel futuro: la riga aperta e anche
  // quella efficace oggi, quindi puo diventare il puntatore corrente.
  if (validTo === null) {
    await tx.supplierProduct.update({
      where: { id: supplierProductId },
      data: { currentPriceId: newPriceId },
    });
  }

  if (data.source === 'MANUAL') {
    await tx.auditLog.create({
      data: {
        organizationId: record.organizationId,
        userId: actor!.id,
        action: 'MANUAL_PRICE_SET',
        entityType: 'SupplierProductPrice',
        entityId: newPriceId,
        detail: { supplierProductId, validFrom: data.validFrom },
      },
    });
  }

  return {
    created: true,
    history: mapHistory(await readHistoryRecord(tx, supplierProductId), null),
  };
}

export function pricesRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  async function setPrice(
    supplierProductId: string,
    input: SetPriceInput,
    createdById?: string | null,
  ): Promise<SetPriceResult> {
    const data = validateSetPriceInput(input);
    const actorId = createdById?.trim() || null;
    if (data.source === 'MANUAL' && !actorId) {
      throw new PriceHistoryValidationError('Un prezzo manuale deve indicare chi lo ha inserito.', {
        _form: ["L'utente che inserisce il prezzo e obbligatorio."],
      });
    }

    return transactionForOrganization(organizationId, async (tx) =>
      applicaPrezzoInTransazione(tx, supplierProductId, input, createdById),
    );
  }

  return {
    async history(supplierProductId: string, at?: Date | string): Promise<PriceHistoryDTO> {
      const queriedAt = at === undefined ? null : normalizeRequestedDay(at);
      return mapHistory(await readHistoryRecord(db, supplierProductId), queriedAt);
    },

    async forProduct(productId: string): Promise<PriceHistoryDTO[]> {
      const product = (await db.product.findFirst({
        where: { id: productId },
        select: {
          supplierProducts: {
            select: HISTORY_SELECT,
            orderBy: [{ supplier: { name: 'asc' } }, { rawName: 'asc' }],
          },
        },
      })) as unknown as { supplierProducts: HistoryRecord[] } | null;
      if (!product) throw new PriceHistoryNotFoundError('Prodotto non trovato.');
      return product.supplierProducts.map((record) => mapHistory(record, null));
    },

    setPrice,

    async setManualPrice(
      supplierProductId: string,
      input: ManualPriceInput,
      userId: string,
    ): Promise<SetManualPriceResult> {
      const data = validateManualInput(input);
      return setPrice(
        supplierProductId,
        {
          ...data,
          source: 'MANUAL',
          priceListId: null,
        },
        userId,
      );
    },
  };
}
