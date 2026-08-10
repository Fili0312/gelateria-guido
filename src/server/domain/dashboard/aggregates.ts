import { Decimal } from 'decimal.js';
import { businessCalendarDay, businessDayStart } from '@/features/prices/date';
import {
  baseDi,
  inUnitaBase,
  type BaseUnit,
  type UnitOfMeasure,
} from '@/server/domain/packaging/units';

/** Una riga gia' filtrata a un ordine realmente confermato. */
export interface DashboardOrderLineInput {
  supplierProductId: string;
  /** Quello fotografato sull'ordine; se mancava, quello collegato in seguito. */
  productId: string | null;
  supplierId: string;
  nameSnapshot: string;
  supplierNameSnapshot: string;
  packQuantitySnapshot: number;
  unitSizeSnapshot: string;
  uomSnapshot: UnitOfMeasure;
  quantityPacks: number;
  lineTotalNet: string;
  department: { id: string; name: string; color: string | null } | null;
}

export interface DashboardOrderInput {
  id: string;
  confirmedAt: Date;
  totalNet: string;
  lines: DashboardOrderLineInput[];
}

export interface DashboardMonth {
  key: string;
  label: string;
  from: Date;
  to: Date;
}

export interface DashboardSpendPoint {
  key: string;
  label: string;
  net: string;
  orders: number;
}

export interface DashboardDepartmentSlice {
  departmentId: string | null;
  name: string;
  color: string | null;
  net: string;
  share: number;
  lines: number;
}

export interface DashboardTopProduct {
  productId: string | null;
  supplierId: string;
  name: string;
  packs: number;
  pieces: number;
  net: string;
  orders: number;
  lastOrderedAt: string;
  /** Consumo reale ricostruito dagli snapshot, separato per dimensione. */
  consumptionByBase: Partial<Record<BaseUnit, string>>;
}

export interface DashboardTopSupplier {
  supplierId: string;
  name: string;
  packs: number;
  net: string;
  orders: number;
  share: number;
}

export interface DashboardOrderAggregates {
  spend: DashboardSpendPoint[];
  departments: DashboardDepartmentSlice[];
  topProducts: DashboardTopProduct[];
  topSuppliers: DashboardTopSupplier[];
}

/**
 * Il collegamento corrente dell'offerta vince su quello scritto quando nacque
 * la riga. Gli altri campi storici non cambiano: si sposta solo l'attribuzione
 * al prodotto se un abbinamento o rematch e' avvenuto dopo l'ordine.
 */
export function resolveDashboardProductId(
  snapshotProductId: string | null,
  currentProductId: string | null,
): string | null {
  return currentProductId ?? snapshotProductId;
}

/**
 * Ultimi mesi di calendario, incluso quello in corso.
 *
 * I limiti sono le mezzanotti di Europe/Rome: il server gira in UTC, ma per la
 * gelateria le 22:30Z del 31 agosto sono gia' il primo settembre.
 */
export function dashboardMonths(reference: Date, count = 12): DashboardMonth[] {
  if (!Number.isInteger(count) || count < 1)
    throw new Error('Il numero di mesi deve essere positivo.');

  const [year, month] = businessCalendarDay(reference).split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const offset = index - count + 1;
    // Date.UTC qui fa soltanto aritmetica di calendario (anche oltre gennaio
    // e dicembre); gli istanti veri arrivano poi da businessDayStart.
    const calendar = new Date(Date.UTC(year, month - 1 + offset, 1));
    const nextCalendar = new Date(Date.UTC(year, month + offset, 1));
    const key = `${calendar.getUTCFullYear()}-${String(calendar.getUTCMonth() + 1).padStart(2, '0')}`;
    const nextKey = `${nextCalendar.getUTCFullYear()}-${String(nextCalendar.getUTCMonth() + 1).padStart(2, '0')}`;
    const from = businessDayStart(`${key}-01`);
    const to = businessDayStart(`${nextKey}-01`);
    return {
      key,
      label: calendar.toLocaleDateString('it-IT', { month: 'short', timeZone: 'UTC' }),
      from,
      to,
    };
  });
}

interface ProductAccumulator {
  productId: string | null;
  supplierId: string;
  name: string;
  packs: number;
  pieces: number;
  net: Decimal;
  orderIds: Set<string>;
  latestAt: Date;
  consumptionByBase: Map<BaseUnit, Decimal>;
}

interface SupplierAccumulator {
  supplierId: string;
  name: string;
  packs: number;
  net: Decimal;
  orderIds: Set<string>;
  latestAt: Date;
}

/**
 * Riduce lo storico in memoria dopo una sola lettura tenant-scoped.
 *
 * Quantita', nomi e importi arrivano esclusivamente dagli snapshot delle
 * righe: rinominare oggi un prodotto o cambiare confezione non riscrive il
 * passato. `productId` serve soltanto per rendere il risultato cliccabile.
 */
export function aggregateDashboardOrders(
  orders: readonly DashboardOrderInput[],
  months: readonly DashboardMonth[],
): DashboardOrderAggregates {
  const spend = months.map((month) => {
    const inside = orders.filter(
      (order) => order.confirmedAt >= month.from && order.confirmedAt < month.to,
    );
    return {
      key: month.key,
      label: month.label,
      net: money(inside.reduce((sum, order) => sum.plus(order.totalNet), new Decimal(0))),
      orders: inside.length,
    };
  });

  const departments = new Map<
    string,
    { departmentId: string | null; name: string; color: string | null; net: Decimal; lines: number }
  >();
  const products = new Map<string, ProductAccumulator>();
  const suppliers = new Map<string, SupplierAccumulator>();

  for (const order of orders) {
    for (const line of order.lines) {
      const departmentKey = line.department?.id ?? 'without-department';
      const department = departments.get(departmentKey) ?? {
        departmentId: line.department?.id ?? null,
        name: line.department?.name ?? 'Senza reparto',
        color: line.department?.color ?? null,
        net: new Decimal(0),
        lines: 0,
      };
      department.net = department.net.plus(line.lineTotalNet);
      department.lines += 1;
      departments.set(departmentKey, department);

      // Le righe senza prodotto canonico restano visibili e raggiungibili dal
      // fornitore. Quando l'abbinamento arriva dopo, `productId` e' gia' stato
      // risolto dal repository prima di entrare qui.
      const productKey = line.productId ?? `supplier-product:${line.supplierProductId}`;
      const product = products.get(productKey) ?? {
        productId: line.productId,
        supplierId: line.supplierId,
        name: line.nameSnapshot,
        packs: 0,
        pieces: 0,
        net: new Decimal(0),
        orderIds: new Set<string>(),
        latestAt: order.confirmedAt,
        consumptionByBase: new Map<BaseUnit, Decimal>(),
      };
      product.packs += line.quantityPacks;
      product.pieces += line.quantityPacks * line.packQuantitySnapshot;
      product.net = product.net.plus(line.lineTotalNet);
      product.orderIds.add(order.id);
      const base = baseDi(line.uomSnapshot);
      const consumed = inUnitaBase(line.unitSizeSnapshot, line.uomSnapshot)
        .mul(line.packQuantitySnapshot)
        .mul(line.quantityPacks);
      product.consumptionByBase.set(
        base,
        (product.consumptionByBase.get(base) ?? new Decimal(0)).plus(consumed),
      );
      if (order.confirmedAt > product.latestAt) {
        product.name = line.nameSnapshot;
        product.supplierId = line.supplierId;
        product.latestAt = order.confirmedAt;
      }
      products.set(productKey, product);

      const supplier = suppliers.get(line.supplierId) ?? {
        supplierId: line.supplierId,
        name: line.supplierNameSnapshot,
        packs: 0,
        net: new Decimal(0),
        orderIds: new Set<string>(),
        latestAt: order.confirmedAt,
      };
      supplier.packs += line.quantityPacks;
      supplier.net = supplier.net.plus(line.lineTotalNet);
      supplier.orderIds.add(order.id);
      if (order.confirmedAt > supplier.latestAt) {
        supplier.name = line.supplierNameSnapshot;
        supplier.latestAt = order.confirmedAt;
      }
      suppliers.set(line.supplierId, supplier);
    }
  }

  const departmentTotal = [...departments.values()].reduce(
    (sum, department) => sum.plus(department.net),
    new Decimal(0),
  );
  const departmentSlices = [...departments.values()]
    .map((department) => ({
      departmentId: department.departmentId,
      name: department.name,
      color: department.color,
      net: money(department.net),
      share: departmentTotal.gt(0)
        ? department.net.div(departmentTotal).mul(100).toDecimalPlaces(2).toNumber()
        : 0,
      lines: department.lines,
    }))
    .sort((a, b) => Number(b.net) - Number(a.net));

  const topProducts = [...products.values()]
    .map((product) => ({
      productId: product.productId,
      supplierId: product.supplierId,
      name: product.name,
      packs: product.packs,
      pieces: product.pieces,
      net: money(product.net),
      orders: product.orderIds.size,
      lastOrderedAt: product.latestAt.toISOString(),
      consumptionByBase: Object.fromEntries(
        [...product.consumptionByBase.entries()].map(([base, quantity]) => [
          base,
          quantity.toString(),
        ]),
      ) as Partial<Record<BaseUnit, string>>,
    }))
    // Pezzi, kg e litri non hanno un denominatore comune. L'impatto netto e'
    // invece confrontabile fra tutti i prodotti e decide la classifica.
    .sort(
      (a, b) =>
        Number(b.net) - Number(a.net) || b.orders - a.orders || a.name.localeCompare(b.name, 'it'),
    );

  const supplierTotal = [...suppliers.values()].reduce(
    (sum, supplier) => sum.plus(supplier.net),
    new Decimal(0),
  );
  const topSuppliers = [...suppliers.values()]
    .map((supplier) => ({
      supplierId: supplier.supplierId,
      name: supplier.name,
      packs: supplier.packs,
      net: money(supplier.net),
      orders: supplier.orderIds.size,
      share: supplierTotal.gt(0)
        ? supplier.net.div(supplierTotal).mul(100).toDecimalPlaces(2).toNumber()
        : 0,
    }))
    .sort(
      (a, b) =>
        Number(b.net) - Number(a.net) || b.orders - a.orders || a.name.localeCompare(b.name, 'it'),
    );

  return { spend, departments: departmentSlices, topProducts, topSuppliers };
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2).toFixed(2);
}
