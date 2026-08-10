import 'server-only';

import type { ProductPurchaseStats, ProductStatsPeriod } from '@/features/products/stats';
import { prismaForOrganization } from '@/server/db';
import {
  calculateProductPurchaseStats,
  productStatsWindow,
  type CurrentProductPriceInput,
  type ProductPurchaseSnapshot,
} from '@/server/domain/orders/product-stats';
import { comparisonRepository } from './comparison';

const PURCHASE_STATUSES = ['CONFIRMED', 'SENT', 'RECEIVED'] as const;

/**
 * Statistiche di acquisto di un prodotto.
 *
 * L'associazione corrente dell'offerta ha precedenza: in questo modo un'offerta
 * abbinata (o riabbinata) dopo l'ordine segue il prodotto corretto. Se invece
 * l'offerta e' stata scollegata, `order_line.productId` resta il fallback
 * storico e l'acquisto non scompare dalle statistiche. Quantita, confezione,
 * prezzo e totale vengono comunque letti soltanto dagli snapshot dell'ordine.
 */
export function productStatsRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  return {
    async get(
      productId: string,
      periodDays: ProductStatsPeriod,
      now = new Date(),
    ): Promise<ProductPurchaseStats | null> {
      const window = productStatsWindow(periodDays, now);
      const rigaDelProdotto = {
        OR: [
          { supplierProduct: { productId } },
          { productId, supplierProduct: { productId: null } },
        ],
      };
      const [product, orders, currentComparison] = await Promise.all([
        db.product.findFirst({ where: { id: productId }, select: { id: true } }),
        db.order.findMany({
          where: {
            status: { in: [...PURCHASE_STATUSES] },
            confirmedAt: { gte: window.from, lte: window.to },
            lines: { some: rigaDelProdotto },
          },
          select: {
            id: true,
            code: true,
            status: true,
            confirmedAt: true,
            lines: {
              where: rigaDelProdotto,
              select: {
                quantityPacks: true,
                packQuantitySnapshot: true,
                unitSizeSnapshot: true,
                uomSnapshot: true,
                unitPriceNetSnapshot: true,
                lineTotalNet: true,
              },
            },
          },
          orderBy: { confirmedAt: 'asc' },
        }),
        comparisonRepository(organizationId).perProdotto(productId),
      ]);

      if (!product) return null;

      const lines: ProductPurchaseSnapshot[] = [];
      for (const order of orders) {
        if (!order.confirmedAt) continue;
        for (const line of order.lines) {
          lines.push({
            orderId: order.id,
            orderCode: order.code,
            orderStatus: order.status,
            confirmedAt: order.confirmedAt,
            quantityPacks: line.quantityPacks,
            packQuantitySnapshot: line.packQuantitySnapshot,
            unitSizeSnapshot: line.unitSizeSnapshot.toString(),
            uomSnapshot: line.uomSnapshot,
            unitPriceNetSnapshot: line.unitPriceNetSnapshot.toString(),
            lineTotalNet: line.lineTotalNet.toString(),
          });
        }
      }

      const best = currentComparison?.best;
      const currentPrice: CurrentProductPriceInput | null = best
        ? {
            supplierProductId: best.supplierProductId,
            supplierName: best.supplierName,
            // Il confronto sceglie l'offerta sul costo normalizzato; qui si
            // mostra il netto che verrebbe davvero scritto nell'ordine.
            pricePerPackage: best.priceNet,
            packQuantity: best.packQuantity,
            stale: best.stale,
            validFrom: new Date(best.validFrom),
            unitDifference: currentComparison?.unitDifference,
            baseUnit: best.baseUnit,
            alternativeSupplierName: currentComparison?.worst?.supplierName ?? null,
          }
        : null;

      return calculateProductPurchaseStats({
        productId,
        periodDays,
        now,
        lines,
        currentPrice,
      });
    },
  };
}
