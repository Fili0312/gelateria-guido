import 'server-only';

import { supplierData } from './suppliers-data';

import { cache } from 'react';
import {
  supplierHasLinkedData,
  type SupplierDetail,
  type SupplierListItem,
  type SupplierListResult,
  type SupplierRelationCounts,
} from '@/features/suppliers/dto';
import {
  supplierInputSchema,
  type SupplierInput,
  type SupplierListQuery,
  type SupplierPatch,
} from '@/features/suppliers/schema';
import { prismaForOrganization } from '@/server/db';

const LIST_SELECT = {
  id: true,
  name: true,
  code: true,
  vatNumber: true,
  email: true,
  phone: true,
  contactName: true,
  pricesIncludeVat: true,
  defaultVatRate: true,
  minOrderValue: true,
  deliveryDays: true,
  extraDiscountPct: true,
  extraDiscountNote: true,
  orderEmail: true,
  sendOrdersByEmail: true,
  active: true,
  updatedAt: true,
  _count: { select: { supplierProducts: true, priceLists: true } },
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  address: true,
  notes: true,
  orderEmailCc: true,
  emailNote: true,
  createdAt: true,
  _count: {
    select: {
      supplierProducts: true,
      priceLists: true,
      importProfiles: true,
      orderLines: true,
      orderDocuments: true,
      emailDeliveries: true,
      aliases: true,
    },
  },
} as const;

interface DecimalLike {
  toString(): string;
}

interface SupplierListRecord {
  id: string;
  name: string;
  code: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  pricesIncludeVat: boolean;
  defaultVatRate: DecimalLike | null;
  minOrderValue: DecimalLike | null;
  deliveryDays: string | null;
  extraDiscountPct: DecimalLike | null;
  extraDiscountNote: string | null;
  orderEmail: string | null;
  sendOrdersByEmail: boolean;
  active: boolean;
  updatedAt: Date;
  _count: { supplierProducts: number; priceLists: number };
}

interface SupplierDetailRecord extends SupplierListRecord {
  address: string | null;
  notes: string | null;
  orderEmailCc: string | null;
  emailNote: string | null;
  createdAt: Date;
  _count: SupplierRelationCounts;
}

export class SupplierNotFoundError extends Error {
  override readonly name = 'SupplierNotFoundError';
}

export class SupplierNameConflictError extends Error {
  override readonly name = 'SupplierNameConflictError';
}

export class SupplierDeleteBlockedError extends Error {
  override readonly name = 'SupplierDeleteBlockedError';

  constructor(readonly counts: SupplierRelationCounts) {
    super('Il fornitore ha dati collegati e non può essere eliminato.');
  }
}

export class SupplierValidationError extends Error {
  override readonly name = 'SupplierValidationError';

  constructor(readonly fields: Record<string, string[]>) {
    super('I dati del fornitore non sono validi.');
  }
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function fieldErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

function mapListSupplier(row: SupplierListRecord): SupplierListItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    vatNumber: row.vatNumber,
    email: row.email,
    phone: row.phone,
    contactName: row.contactName,
    pricesIncludeVat: row.pricesIncludeVat,
    defaultVatRate: row.defaultVatRate?.toString() ?? null,
    minOrderValue: row.minOrderValue?.toString() ?? null,
    deliveryDays: row.deliveryDays,
    extraDiscountPct: row.extraDiscountPct?.toString() ?? null,
    extraDiscountNote: row.extraDiscountNote,
    orderEmail: row.orderEmail,
    sendOrdersByEmail: row.sendOrdersByEmail,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
    counts: {
      supplierProducts: row._count.supplierProducts,
      priceLists: row._count.priceLists,
    },
  };
}

function mapDetailSupplier(row: SupplierDetailRecord): SupplierDetail {
  return {
    ...mapListSupplier(row),
    address: row.address,
    notes: row.notes,
    orderEmailCc: row.orderEmailCc,
    emailNote: row.emailNote,
    createdAt: row.createdAt.toISOString(),
    counts: { ...row._count },
  };
}

function detailAsInput(supplier: SupplierDetail): SupplierInput {
  return {
    name: supplier.name,
    code: supplier.code,
    vatNumber: supplier.vatNumber,
    email: supplier.email,
    phone: supplier.phone,
    contactName: supplier.contactName,
    address: supplier.address,
    notes: supplier.notes,
    pricesIncludeVat: supplier.pricesIncludeVat,
    defaultVatRate: supplier.defaultVatRate,
    minOrderValue: supplier.minOrderValue,
    deliveryDays: supplier.deliveryDays,
    extraDiscountPct: supplier.extraDiscountPct,
    extraDiscountNote: supplier.extraDiscountNote,
    orderEmail: supplier.orderEmail,
    orderEmailCc: supplier.orderEmailCc,
    sendOrdersByEmail: supplier.sendOrdersByEmail,
    emailNote: supplier.emailNote,
    active: supplier.active,
  };
}


function listOrderBy(sort: SupplierListQuery['sort']) {
  if (sort === 'name-desc') return [{ name: 'desc' as const }];
  if (sort === 'updated-desc') return [{ updatedAt: 'desc' as const }];
  if (sort === 'updated-asc') return [{ updatedAt: 'asc' as const }];
  return [{ name: 'asc' as const }];
}

export function suppliersRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  async function findDetail(id: string): Promise<SupplierDetail | null> {
    const row = await db.supplier.findFirst({ where: { id }, select: DETAIL_SELECT });
    return row ? mapDetailSupplier(row) : null;
  }

  async function assertNameAvailable(name: string, excludedId?: string) {
    const duplicate = await db.supplier.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludedId ? { NOT: { id: excludedId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) throw new SupplierNameConflictError('Esiste già un fornitore con questo nome.');
  }

  return {
    async list(filters: SupplierListQuery): Promise<SupplierListResult> {
      const statusWhere =
        filters.status === 'active'
          ? { active: true }
          : filters.status === 'inactive'
            ? { active: false }
            : {};
      const searchWhere = filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: 'insensitive' as const } },
              { code: { contains: filters.q, mode: 'insensitive' as const } },
              { vatNumber: { contains: filters.q, mode: 'insensitive' as const } },
              { contactName: { contains: filters.q, mode: 'insensitive' as const } },
              { email: { contains: filters.q, mode: 'insensitive' as const } },
              { orderEmail: { contains: filters.q, mode: 'insensitive' as const } },
            ],
          }
        : {};

      const [rows, active, inactive] = await Promise.all([
        db.supplier.findMany({
          where: { ...statusWhere, ...searchWhere },
          orderBy: listOrderBy(filters.sort),
          take: 250,
          select: LIST_SELECT,
        }),
        db.supplier.count({ where: { active: true } }),
        db.supplier.count({ where: { active: false } }),
      ]);

      return { items: rows.map(mapListSupplier), total: active + inactive, active, inactive };
    },

    findDetail,

    async create(input: SupplierInput): Promise<SupplierDetail> {
      await assertNameAvailable(input.name);
      try {
        const row = await db.supplier.create({
          data: supplierData(organizationId, input),
          select: DETAIL_SELECT,
        });
        return mapDetailSupplier(row);
      } catch (error) {
        if (errorCode(error) === 'P2002') {
          throw new SupplierNameConflictError('Esiste già un fornitore con questo nome.');
        }
        throw error;
      }
    },

    async update(id: string, patch: SupplierPatch): Promise<SupplierDetail> {
      const current = await findDetail(id);
      if (!current) throw new SupplierNotFoundError('Fornitore non trovato.');

      const complete = supplierInputSchema.safeParse({ ...detailAsInput(current), ...patch });
      if (!complete.success) {
        throw new SupplierValidationError(fieldErrors(complete.error.issues));
      }

      await assertNameAvailable(complete.data.name, id);
      try {
        const row = await db.supplier.update({
          where: { id },
          data: supplierData(organizationId, complete.data),
          select: DETAIL_SELECT,
        });
        return mapDetailSupplier(row);
      } catch (error) {
        const code = errorCode(error);
        if (code === 'P2002') {
          throw new SupplierNameConflictError('Esiste già un fornitore con questo nome.');
        }
        if (code === 'P2025') throw new SupplierNotFoundError('Fornitore non trovato.');
        throw error;
      }
    },

    async delete(id: string): Promise<void> {
      const current = await findDetail(id);
      if (!current) throw new SupplierNotFoundError('Fornitore non trovato.');
      if (supplierHasLinkedData(current.counts)) {
        throw new SupplierDeleteBlockedError(current.counts);
      }

      try {
        await db.supplier.delete({ where: { id } });
      } catch (error) {
        const code = errorCode(error);
        if (code === 'P2025') throw new SupplierNotFoundError('Fornitore non trovato.');
        if (code === 'P2003') throw new SupplierDeleteBlockedError(current.counts);
        throw error;
      }
    },
  };
}

export const getSupplierDetail = cache(async (organizationId: string, id: string) =>
  suppliersRepository(organizationId).findDetail(id),
);
