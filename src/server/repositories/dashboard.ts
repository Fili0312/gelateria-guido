import 'server-only';

import { Decimal } from 'decimal.js';
import { prismaForOrganization } from '@/server/db';

/**
 * La panoramica: cosa sta succedendo, non quante righe ci sono in anagrafica.
 *
 * «Categorie attive: 29» è un numero vero e inutile: non cambia mai e non fa
 * decidere niente. Qui stanno solo due tipi di dato — **quanto si sta
 * spendendo e in cosa**, e **cosa c'è da fare adesso**. Ogni riquadro porta
 * alla schermata in cui si agisce: un numero che non si può aprire è
 * decorazione.
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
  spesa: PuntoSpesa[];
  reparti: FettaReparto[];
  /** La ripartizione mostra la bozza quando non ci sono ancora ordini. */
  repartiDaBozza: boolean;
  daFare: DaFare;
  catalogo: { prodotti: number; fornitori: number; conConfronto: number };
}

/** Gli ultimi dodici mesi, anche quelli senza ordini: un buco è un dato. */
function mesi(quanti: number): { chiave: string; etichetta: string; da: Date; a: Date }[] {
  const oggi = new Date();
  const elenco = [];
  for (let i = quanti - 1; i >= 0; i--) {
    const da = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
    const a = new Date(oggi.getFullYear(), oggi.getMonth() - i + 1, 1);
    elenco.push({
      chiave: `${da.getFullYear()}-${String(da.getMonth() + 1).padStart(2, '0')}`,
      etichetta: da.toLocaleDateString('it-IT', { month: 'short' }),
      da,
      a,
    });
  }
  return elenco;
}

export function dashboardRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  return {
    async panoramica(userId: string): Promise<Panoramica> {
      const dodici = mesi(12);
      const trenta = new Date();
      trenta.setDate(trenta.getDate() - 30);

      const [bozza, confermati, recenti, daFare, catalogo] = await Promise.all([
        db.order.findFirst({
          where: { status: 'DRAFT', createdById: userId },
          select: {
            id: true,
            totalNet: true,
            lines: {
              select: {
                quantityPacks: true,
                supplierId: true,
                lineTotalNet: true,
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
        }),
        // Le righe arrivano annidate: `order_line` non ha `organizationId` e
        // il client con scope non lo espone. Una query sola invece di due.
        db.order.findMany({
          where: { status: { in: ['CONFIRMED', 'SENT', 'RECEIVED'] } },
          select: {
            id: true,
            confirmedAt: true,
            totalNet: true,
            lines: {
              select: {
                lineTotalNet: true,
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
          orderBy: { confirmedAt: 'desc' },
        }),
        db.order.count({
          where: {
            status: { in: ['CONFIRMED', 'SENT', 'RECEIVED'] },
            confirmedAt: { gte: trenta },
          },
        }),
        Promise.all([
          db.priceList
            .findMany({
              select: {
                _count: { select: { rows: { where: { matchStatus: 'PENDING', reviewedAt: null } } } },
              },
            })
            .then((elenco) => elenco.reduce((n, l) => n + l._count.rows, 0)),
          db.priceList.count({ where: { status: 'REVIEW' } }),
          db.product.count({ where: { categoryId: null } }),
          db.supplierProduct.count({ where: { active: true, packQuantityConfirmed: false } }),
          db.product.count({ where: { bestOffer: { comparable: false } } }),
        ]),
        Promise.all([
          db.product.count(),
          db.supplier.count({ where: { active: true } }),
          db.product.count({ where: { bestOffer: { comparable: true } } }),
        ]),
      ]);

      // ── Spesa mese per mese ────────────────────────────────────────────
      const spesa: PuntoSpesa[] = dodici.map((m) => {
        const dentro = confermati.filter(
          (o) => o.confirmedAt && o.confirmedAt >= m.da && o.confirmedAt < m.a,
        );
        return {
          chiave: m.chiave,
          etichetta: m.etichetta,
          netto: dentro
            .reduce((acc, o) => acc.plus(o.totalNet.toString()), new Decimal(0))
            .toDecimalPlaces(2)
            .toString(),
          ordini: dentro.length,
        };
      });

      // ── Ripartizione per reparto ───────────────────────────────────────
      //
      // Dagli ordini confermati quando ce ne sono; dalla bozza in corso quando
      // non ce ne sono ancora, perché «cosa sto ordinando adesso» è comunque la
      // domanda a cui questo riquadro risponde, e un grafico vuoto al primo
      // avvio non racconta niente.
      const righeConfermate = confermati.flatMap((o) => o.lines);
      const daOrdini = righeConfermate.length > 0;
      const sorgente = daOrdini
        ? righeConfermate
        : (bozza?.lines ?? []).map((l) => ({ lineTotalNet: l.lineTotalNet, product: l.product }));

      const gruppi = new Map<string, { nome: string; colore: string | null; netto: Decimal; righe: number }>();
      for (const riga of sorgente) {
        const reparto = riga.product?.category?.department ?? null;
        const chiave = reparto?.id ?? '—';
        const g = gruppi.get(chiave) ?? {
          nome: reparto?.name ?? 'Senza reparto',
          colore: reparto?.color ?? null,
          netto: new Decimal(0),
          righe: 0,
        };
        g.netto = g.netto.plus(riga.lineTotalNet.toString());
        g.righe += 1;
        gruppi.set(chiave, g);
      }
      const totaleReparti = [...gruppi.values()].reduce((a, g) => a.plus(g.netto), new Decimal(0));
      const reparti: FettaReparto[] = [...gruppi.entries()]
        .map(([id, g]) => ({
          departmentId: id === '—' ? null : id,
          nome: g.nome,
          colore: g.colore,
          netto: g.netto.toDecimalPlaces(2).toString(),
          quota: totaleReparti.gt(0) ? g.netto.div(totaleReparti).mul(100).toNumber() : 0,
          righe: g.righe,
        }))
        .sort((a, b) => Number(b.netto) - Number(a.netto));

      const spesaUltimi30 = confermati
        .filter((o) => o.confirmedAt && o.confirmedAt >= trenta)
        .reduce((acc, o) => acc.plus(o.totalNet.toString()), new Decimal(0));

      const righeBozza = bozza?.lines ?? [];
      const [righeDaAbbinare, listiniInRevisione, prodottiDaClassificare, confezioniDaDefinire, prodottiSenzaConfronto] =
        daFare;
      const [prodotti, fornitori, conConfronto] = catalogo;

      return {
        bozza: {
          id: bozza?.id ?? null,
          righe: righeBozza.length,
          confezioni: righeBozza.reduce((n, l) => n + l.quantityPacks, 0),
          netto: (bozza?.totalNet ?? new Decimal(0)).toString(),
          fornitori: new Set(righeBozza.map((l) => l.supplierId)).size,
        },
        ordini: {
          confermati: confermati.length,
          ultimi30giorni: recenti,
          spesaUltimi30: spesaUltimi30.toDecimalPlaces(2).toString(),
          ultimoIl: confermati[0]?.confirmedAt?.toISOString() ?? null,
        },
        spesa,
        reparti,
        repartiDaBozza: !daOrdini,
        daFare: {
          righeDaAbbinare,
          listiniInRevisione,
          prodottiDaClassificare,
          confezioniDaDefinire,
          prodottiSenzaConfronto,
        },
        catalogo: { prodotti, fornitori, conConfronto },
      };
    },
  };
}
