import 'server-only';

import { Decimal } from 'decimal.js';
import { unstable_cache } from 'next/cache';
import type { ComparisonReport } from '@/features/reports/dto';
import { prismaForOrganization } from '@/server/db';
import {
  aggregateDashboardOrders,
  dashboardMonths,
  resolveDashboardProductId,
  type DashboardOrderInput,
} from '@/server/domain/dashboard/aggregates';
import { calculateAnnualSavingsFromConsumption } from '@/server/domain/orders/product-stats';
import type { BaseUnit, UnitOfMeasure } from '@/server/domain/packaging/units';
import { comparisonRepository } from './comparison';

/**
 * La fotografia d'insieme dell'organizzazione.
 *
 * La parte pesante e' tenant-scoped e resta in cache per trenta secondi. La
 * bozza, invece, appartiene all'utente e viene sempre letta in diretta: non va
 * mai condivisa fra utenti neppure se fanno parte della stessa organizzazione.
 */

export interface PuntoSpesa {
  /** `2026-08`, e l'etichetta breve per l'asse. */
  chiave: string;
  etichetta: string;
  netto: string;
  ordini: number;
}

export interface FettaReparto {
  departmentId: string | null;
  nome: string;
  colore: string | null;
  netto: string;
  quota: number;
  righe: number;
}

export interface DaFare {
  righeDaAbbinare: number;
  listiniInRevisione: number;
  prodottiDaClassificare: number;
  confezioniDaDefinire: number;
  prodottiSenzaConfronto: number;
}

export interface ProdottoAcquistato {
  productId: string | null;
  supplierId: string;
  nome: string;
  confezioni: number;
  pezzi: number;
  netto: string;
  ordini: number;
  ultimoAcquisto: string;
}

export interface FornitoreUsato {
  supplierId: string;
  nome: string;
  confezioni: number;
  netto: string;
  ordini: number;
  quota: number;
}

export interface AumentoPrezzo {
  supplierProductId: string;
  productId: string | null;
  supplierId: string;
  prodotto: string;
  fornitore: string;
  prima: string;
  adesso: string;
  aumentoPct: string;
  dal: string;
}

export interface RisparmioProdotto {
  productId: string;
  nome: string;
  importoAnnuo: string;
  migliore: string;
  alternativa: string;
}

export interface UltimoListino {
  id: string;
  supplierId: string;
  fornitore: string;
  copertura: string;
  nomeFile: string;
  stato: string;
  righe: number;
  caricatoIl: string;
  applicatoIl: string | null;
}

export interface ProdottoSenzaConfronto {
  productId: string;
  nome: string;
  motivo: string;
}

export interface ProdottoSparito {
  supplierProductId: string;
  productId: string | null;
  supplierId: string;
  prodotto: string;
  fornitore: string;
  sparitoIl: string;
  ultimoListinoId: string | null;
}

export interface Panoramica {
  bozza: {
    id: string | null;
    righe: number;
    confezioni: number;
    netto: string;
    fornitori: number;
  };
  ordini: {
    confermati: number;
    ultimi30giorni: number;
    spesaUltimi30: string;
    ultimoIl: string | null;
  };
  periodo: { dal: string; al: string; giorniOsservati: number };
  spesa: PuntoSpesa[];
  reparti: FettaReparto[];
  /** La ripartizione mostra la bozza quando non ci sono ancora ordini. */
  repartiDaBozza: boolean;
  prodottiPiuAcquistati: ProdottoAcquistato[];
  fornitoriPiuUsati: FornitoreUsato[];
  aumentiPrezzo: AumentoPrezzo[];
  risparmioPotenziale: {
    importoAnnuo: string;
    incidenzaPct: string;
    prodotti: number;
    dettaglio: RisparmioProdotto[];
  };
  ultimiListini: UltimoListino[];
  senzaConfronto: { totale: number; prodotti: ProdottoSenzaConfronto[] };
  spariti: { totale: number; prodotti: ProdottoSparito[] };
  daFare: DaFare;
  catalogo: { prodotti: number; fornitori: number; conConfronto: number };
}

type Department = { id: string; name: string; color: string | null };

interface OrganizationOverview extends Omit<Panoramica, 'bozza' | 'repartiDaBozza'> {
  reparti: FettaReparto[];
}

const STATI_ACQUISTO = ['CONFIRMED', 'SENT', 'RECEIVED'] as const;
const DAY_MS = 86_400_000;

function departmentOf(line: {
  product: { category: { department: Department } | null } | null;
  supplierProduct: {
    productId: string | null;
    product: { category: { department: Department } | null } | null;
  };
}): Department | null {
  return (
    line.supplierProduct.product?.category?.department ?? line.product?.category?.department ?? null
  );
}

function priceIncreases(
  offers: readonly {
    id: string;
    supplierId: string;
    rawName: string;
    productId: string | null;
    product: { name: string } | null;
    supplier: { name: string };
    currentPrice: { priceNet: { toString(): string }; validFrom: Date } | null;
    prices: { priceNet: { toString(): string } }[];
  }[],
): AumentoPrezzo[] {
  return offers
    .flatMap((offer) => {
      const current = offer.currentPrice;
      const previous = offer.prices[0];
      if (!current || !previous) return [];
      const before = new Decimal(previous.priceNet.toString());
      const now = new Decimal(current.priceNet.toString());
      if (before.lte(0) || now.lte(before)) return [];
      return [
        {
          supplierProductId: offer.id,
          productId: offer.productId,
          supplierId: offer.supplierId,
          prodotto: offer.product?.name ?? offer.rawName,
          fornitore: offer.supplier.name,
          prima: before.toString(),
          adesso: now.toString(),
          aumentoPct: now.minus(before).div(before).mul(100).toDecimalPlaces(2).toString(),
          dal: current.validFrom.toISOString(),
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.aumentoPct) - Number(a.aumentoPct) || a.prodotto.localeCompare(b.prodotto, 'it'),
    )
    .slice(0, 5);
}

function comparisonLabel(row: ComparisonReport['withoutComparison'][number]): string {
  if (row.state === 'OFFERTA_UNICA') return 'Un solo fornitore confrontabile';
  if (row.state === 'SENZA_PREZZO') return 'Nessun prezzo corrente utilizzabile';
  return row.reason ?? 'Confezioni o unità non confrontabili';
}

function annualSavings(input: {
  orders: readonly DashboardOrderInput[];
  topProducts: ReturnType<typeof aggregateDashboardOrders>['topProducts'];
  comparisons: ComparisonReport['comparisons'];
  observedDays: number;
}): Panoramica['risparmioPotenziale'] {
  const linesByProduct = new Map<
    string,
    {
      quantityPacks: number;
      packQuantitySnapshot: number;
      unitSizeSnapshot: string;
      uomSnapshot: UnitOfMeasure;
    }[]
  >();
  for (const order of input.orders) {
    for (const line of order.lines) {
      if (!line.productId) continue;
      const lines = linesByProduct.get(line.productId) ?? [];
      lines.push({
        quantityPacks: line.quantityPacks,
        packQuantitySnapshot: line.packQuantitySnapshot,
        unitSizeSnapshot: line.unitSizeSnapshot,
        uomSnapshot: line.uomSnapshot,
      });
      linesByProduct.set(line.productId, lines);
    }
  }

  const names = new Map(
    input.topProducts.flatMap((product) =>
      product.productId ? ([[product.productId, product.name]] as const) : [],
    ),
  );
  const opportunities: RisparmioProdotto[] = [];
  for (const comparison of input.comparisons) {
    if (!comparison.best || !comparison.worst || !comparison.unitDifference) continue;
    const lines = linesByProduct.get(comparison.productId);
    if (!lines) continue;
    const calculation = calculateAnnualSavingsFromConsumption({
      lines,
      periodDays: input.observedDays,
      baseUnit: comparison.best.baseUnit as BaseUnit,
      unitDifference: comparison.unitDifference,
    });
    if (!calculation.ok || Number(calculation.amount) <= 0) continue;
    opportunities.push({
      productId: comparison.productId,
      nome: names.get(comparison.productId) ?? comparison.productName,
      importoAnnuo: calculation.amount,
      migliore: comparison.best.supplierName,
      alternativa: comparison.worst.supplierName,
    });
  }
  opportunities.sort(
    (a, b) => Number(b.importoAnnuo) - Number(a.importoAnnuo) || a.nome.localeCompare(b.nome, 'it'),
  );
  const total = opportunities.reduce(
    (sum, opportunity) => sum.plus(opportunity.importoAnnuo),
    new Decimal(0),
  );
  const observedSpend = input.orders.reduce(
    (sum, order) => sum.plus(order.totalNet),
    new Decimal(0),
  );
  const annualizedSpend = observedSpend.mul(365).div(input.observedDays);
  return {
    importoAnnuo: total.toDecimalPlaces(2).toFixed(2),
    incidenzaPct: annualizedSpend.gt(0)
      ? total.div(annualizedSpend).mul(100).toDecimalPlaces(1).toString()
      : '0',
    prodotti: opportunities.length,
    dettaglio: opportunities.slice(0, 5),
  };
}

async function calculateOrganizationOverview(
  organizationId: string,
): Promise<OrganizationOverview> {
  const db = prismaForOrganization(organizationId);
  const now = new Date();
  const months = dashboardMonths(now, 12);
  const periodFrom = months[0]!.from;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [
    ordersRaw,
    confirmedCount,
    latestOrder,
    queues,
    catalog,
    offersWithHistory,
    recentPriceLists,
    disappearedOffers,
    comparisonReport,
  ] = await Promise.all([
    db.order.findMany({
      where: { status: { in: [...STATI_ACQUISTO] }, confirmedAt: { gte: periodFrom, lte: now } },
      select: {
        id: true,
        confirmedAt: true,
        totalNet: true,
        lines: {
          select: {
            supplierProductId: true,
            productId: true,
            supplierId: true,
            nameSnapshot: true,
            supplierNameSnapshot: true,
            packQuantitySnapshot: true,
            unitSizeSnapshot: true,
            uomSnapshot: true,
            quantityPacks: true,
            lineTotalNet: true,
            product: {
              select: {
                category: {
                  select: { department: { select: { id: true, name: true, color: true } } },
                },
              },
            },
            supplierProduct: {
              select: {
                productId: true,
                product: {
                  select: {
                    category: {
                      select: { department: { select: { id: true, name: true, color: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { confirmedAt: 'desc' },
    }),
    db.order.count({
      where: { status: { in: [...STATI_ACQUISTO] }, confirmedAt: { not: null } },
    }),
    db.order.findFirst({
      where: { status: { in: [...STATI_ACQUISTO] }, confirmedAt: { not: null } },
      select: { confirmedAt: true },
      orderBy: { confirmedAt: 'desc' },
    }),
    Promise.all([
      db.priceList
        .findMany({
          select: {
            _count: { select: { rows: { where: { matchStatus: 'PENDING', reviewedAt: null } } } },
          },
        })
        .then((lists) => lists.reduce((total, list) => total + list._count.rows, 0)),
      db.priceList.count({ where: { status: 'REVIEW' } }),
      db.product.count({ where: { categoryId: null } }),
      db.supplierProduct.count({ where: { active: true, packQuantityConfirmed: false } }),
    ]),
    Promise.all([db.product.count(), db.supplier.count({ where: { active: true } })]),
    db.supplierProduct.findMany({
      where: {
        active: true,
        currentPriceId: { not: null },
        prices: { some: { validTo: { not: null } } },
      },
      select: {
        id: true,
        supplierId: true,
        rawName: true,
        productId: true,
        product: { select: { name: true } },
        supplier: { select: { name: true } },
        currentPrice: { select: { priceNet: true, validFrom: true } },
        prices: {
          where: { validTo: { not: null } },
          select: { priceNet: true },
          orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    }),
    db.priceList.findMany({
      select: {
        id: true,
        supplierId: true,
        supplier: { select: { name: true } },
        scopeLabel: true,
        originalFilename: true,
        status: true,
        uploadedAt: true,
        appliedAt: true,
        _count: { select: { rows: true } },
      },
      orderBy: { uploadedAt: 'desc' },
      take: 5,
    }),
    db.supplierProduct.findMany({
      // `active = false` da solo comprende anche una disattivazione manuale.
      // Qui interessano esclusivamente le offerte marcate come sparite da un
      // listino applicato, che hanno sempre la data dedicata.
      where: { active: false, disappearedAt: { not: null } },
      select: {
        id: true,
        productId: true,
        supplierId: true,
        rawName: true,
        disappearedAt: true,
        lastSeenPriceListId: true,
        product: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { lastSeenAt: 'desc' },
    }),
    comparisonRepository(organizationId).report(),
  ]);

  const orders: DashboardOrderInput[] = ordersRaw.flatMap((order) =>
    order.confirmedAt
      ? [
          {
            id: order.id,
            confirmedAt: order.confirmedAt,
            totalNet: order.totalNet.toString(),
            lines: order.lines.map((line) => ({
              supplierProductId: line.supplierProductId,
              productId: resolveDashboardProductId(line.productId, line.supplierProduct.productId),
              supplierId: line.supplierId,
              nameSnapshot: line.nameSnapshot,
              supplierNameSnapshot: line.supplierNameSnapshot,
              packQuantitySnapshot: line.packQuantitySnapshot,
              unitSizeSnapshot: line.unitSizeSnapshot.toString(),
              uomSnapshot: line.uomSnapshot as UnitOfMeasure,
              quantityPacks: line.quantityPacks,
              lineTotalNet: line.lineTotalNet.toString(),
              department: departmentOf(line),
            })),
          },
        ]
      : [],
  );
  const aggregates = aggregateDashboardOrders(orders, months);
  const observedDays = Math.max(1, Math.ceil((now.getTime() - periodFrom.getTime()) / DAY_MS));
  const recentOrders = orders.filter((order) => order.confirmedAt >= thirtyDaysAgo);
  const [unmatchedRows, priceListsInReview, unclassifiedProducts, undefinedPackages] = queues;
  const [products, suppliers] = catalog;

  const disappeared = disappearedOffers
    .map((offer) => ({
      supplierProductId: offer.id,
      productId: offer.productId,
      supplierId: offer.supplierId,
      prodotto: offer.product?.name ?? offer.rawName,
      fornitore: offer.supplier.name,
      sparitoIl: offer.disappearedAt!.toISOString(),
      ultimoListinoId: offer.lastSeenPriceListId,
    }))
    .sort((a, b) => b.sparitoIl.localeCompare(a.sparitoIl));

  return {
    ordini: {
      confermati: confirmedCount,
      ultimi30giorni: recentOrders.length,
      spesaUltimi30: recentOrders
        .reduce((sum, order) => sum.plus(order.totalNet), new Decimal(0))
        .toDecimalPlaces(2)
        .toFixed(2),
      ultimoIl: latestOrder?.confirmedAt?.toISOString() ?? null,
    },
    periodo: {
      dal: periodFrom.toISOString(),
      al: now.toISOString(),
      giorniOsservati: observedDays,
    },
    spesa: aggregates.spend.map((point) => ({
      chiave: point.key,
      etichetta: point.label,
      netto: point.net,
      ordini: point.orders,
    })),
    reparti: aggregates.departments.map((department) => ({
      departmentId: department.departmentId,
      nome: department.name,
      colore: department.color,
      netto: department.net,
      quota: department.share,
      righe: department.lines,
    })),
    prodottiPiuAcquistati: aggregates.topProducts.slice(0, 5).map((product) => ({
      productId: product.productId,
      supplierId: product.supplierId,
      nome: product.name,
      confezioni: product.packs,
      pezzi: product.pieces,
      netto: product.net,
      ordini: product.orders,
      ultimoAcquisto: product.lastOrderedAt,
    })),
    fornitoriPiuUsati: aggregates.topSuppliers.slice(0, 5).map((supplier) => ({
      supplierId: supplier.supplierId,
      nome: supplier.name,
      confezioni: supplier.packs,
      netto: supplier.net,
      ordini: supplier.orders,
      quota: supplier.share,
    })),
    aumentiPrezzo: priceIncreases(offersWithHistory),
    risparmioPotenziale: annualSavings({
      orders,
      topProducts: aggregates.topProducts,
      comparisons: comparisonReport.comparisons,
      observedDays,
    }),
    ultimiListini: recentPriceLists.map((list) => ({
      id: list.id,
      supplierId: list.supplierId,
      fornitore: list.supplier.name,
      copertura: list.scopeLabel,
      nomeFile: list.originalFilename,
      stato: list.status,
      righe: list._count.rows,
      caricatoIl: list.uploadedAt.toISOString(),
      applicatoIl: list.appliedAt?.toISOString() ?? null,
    })),
    senzaConfronto: {
      totale: comparisonReport.withoutComparison.length,
      prodotti: comparisonReport.withoutComparison.slice(0, 5).map((row) => ({
        productId: row.productId,
        nome: row.productName,
        motivo: comparisonLabel(row),
      })),
    },
    spariti: { totale: disappeared.length, prodotti: disappeared.slice(0, 5) },
    daFare: {
      righeDaAbbinare: unmatchedRows,
      listiniInRevisione: priceListsInReview,
      prodottiDaClassificare: unclassifiedProducts,
      confezioniDaDefinire: undefinedPackages,
      prodottiSenzaConfronto: comparisonReport.withoutComparison.length,
    },
    catalogo: {
      prodotti: products,
      fornitori: suppliers,
      conConfronto: comparisonReport.totals.compared,
    },
  };
}

const cachedOrganizationOverview = unstable_cache(
  calculateOrganizationOverview,
  ['dashboard-organization-overview-v1'],
  { revalidate: 30, tags: ['dashboard'] },
);

export function dashboardRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  return {
    async panoramica(userId: string): Promise<Panoramica> {
      const [overview, draft] = await Promise.all([
        cachedOrganizationOverview(organizationId),
        db.order.findFirst({
          where: { status: 'DRAFT', createdById: userId },
          select: {
            id: true,
            totalNet: true,
            updatedAt: true,
            lines: {
              select: {
                supplierProductId: true,
                productId: true,
                supplierId: true,
                nameSnapshot: true,
                supplierNameSnapshot: true,
                packQuantitySnapshot: true,
                unitSizeSnapshot: true,
                uomSnapshot: true,
                quantityPacks: true,
                lineTotalNet: true,
                product: {
                  select: {
                    category: {
                      select: { department: { select: { id: true, name: true, color: true } } },
                    },
                  },
                },
                supplierProduct: {
                  select: {
                    productId: true,
                    product: {
                      select: {
                        category: {
                          select: {
                            department: { select: { id: true, name: true, color: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ]);

      const draftLines = draft?.lines ?? [];
      let departments = overview.reparti;
      let fromDraft = false;
      if (departments.length === 0 && draft && draftLines.length > 0) {
        const draftAggregate = aggregateDashboardOrders(
          [
            {
              id: draft.id,
              confirmedAt: draft.updatedAt,
              totalNet: draft.totalNet.toString(),
              lines: draftLines.map((line) => ({
                supplierProductId: line.supplierProductId,
                productId: resolveDashboardProductId(
                  line.productId,
                  line.supplierProduct.productId,
                ),
                supplierId: line.supplierId,
                nameSnapshot: line.nameSnapshot,
                supplierNameSnapshot: line.supplierNameSnapshot,
                packQuantitySnapshot: line.packQuantitySnapshot,
                unitSizeSnapshot: line.unitSizeSnapshot.toString(),
                uomSnapshot: line.uomSnapshot as UnitOfMeasure,
                quantityPacks: line.quantityPacks,
                lineTotalNet: line.lineTotalNet.toString(),
                department: departmentOf(line),
              })),
            },
          ],
          dashboardMonths(draft.updatedAt, 1),
        );
        departments = draftAggregate.departments.map((department) => ({
          departmentId: department.departmentId,
          nome: department.name,
          colore: department.color,
          netto: department.net,
          quota: department.share,
          righe: department.lines,
        }));
        fromDraft = true;
      }

      return {
        ...overview,
        bozza: {
          id: draft?.id ?? null,
          righe: draftLines.length,
          confezioni: draftLines.reduce((total, line) => total + line.quantityPacks, 0),
          netto: (draft?.totalNet ?? new Decimal(0)).toString(),
          fornitori: new Set(draftLines.map((line) => line.supplierId)).size,
        },
        reparti: departments,
        repartiDaBozza: fromDraft,
      };
    },
  };
}
