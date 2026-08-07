export interface SupplierRelationCounts {
  priceLists: number;
  supplierProducts: number;
  importProfiles: number;
  orderLines: number;
  orderDocuments: number;
  emailDeliveries: number;
  aliases: number;
}

export interface SupplierListItem {
  id: string;
  name: string;
  code: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  pricesIncludeVat: boolean;
  defaultVatRate: string | null;
  minOrderValue: string | null;
  deliveryDays: string | null;
  orderEmail: string | null;
  sendOrdersByEmail: boolean;
  active: boolean;
  updatedAt: string;
  counts: Pick<SupplierRelationCounts, 'priceLists' | 'supplierProducts'>;
}

export interface SupplierDetail extends Omit<SupplierListItem, 'counts'> {
  address: string | null;
  notes: string | null;
  orderEmailCc: string | null;
  emailNote: string | null;
  createdAt: string;
  counts: SupplierRelationCounts;
}

export interface SupplierListResult {
  items: SupplierListItem[];
  total: number;
  active: number;
  inactive: number;
}

export interface SupplierApiErrorBody {
  ok: false;
  error: string;
  fields?: Record<string, string[]>;
  canDeactivate?: boolean;
  counts?: SupplierRelationCounts;
}

export interface SupplierApiSuccessBody<T> {
  ok: true;
  data: T;
}

export type SupplierApiBody<T> = SupplierApiSuccessBody<T> | SupplierApiErrorBody;

export function supplierLinkedDataCount(counts: SupplierRelationCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

export function supplierHasLinkedData(counts: SupplierRelationCounts): boolean {
  return supplierLinkedDataCount(counts) > 0;
}
