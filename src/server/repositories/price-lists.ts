import 'server-only';

import type {
  CoperturaEsistente,
  FaseImport,
  PriceListDetail,
  PriceListItem,
  RigaListino,
  RigheListino,
  StatoLavorazione,
  StatoListino,
} from '@/features/price-lists/dto';
import type { PriceListListQuery, PriceListUpload, RowsQuery } from '@/features/price-lists/schema';
import { prismaForOrganization, transactionForOrganization } from '@/server/db';

export class PriceListNotFoundError extends Error {
  override readonly name = 'PriceListNotFoundError';
}

export class PriceListConflictError extends Error {
  override readonly name = 'PriceListConflictError';
  constructor(
    message: string,
    readonly dettagli?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class PriceListValidationError extends Error {
  override readonly name = 'PriceListValidationError';
  constructor(
    message: string,
    readonly fields: Record<string, string[]>,
  ) {
    super(message);
  }
}

/**
 * Oltre questo tempo senza segni di vita, un job in corso è considerato
 * interrotto: il processo che lo stava eseguendo non c'è più.
 *
 * Due minuti e non venti secondi perché il battito si aggiorna a ogni lotto
 * di righe, e su un listino grosso un lotto può prendere qualche secondo; una
 * soglia stretta dichiarerebbe morto un job che sta solo lavorando.
 */
export const SCADENZA_BATTITO_MS = 2 * 60 * 1000;

const FASI_TERMINALI = ['DONE', 'FAILED', 'CANCELLED'] as const satisfies readonly FaseImport[];
const INSIEME_TERMINALI: ReadonlySet<FaseImport> = new Set(FASI_TERMINALI);

export function faseTerminale(fase: FaseImport): boolean {
  return INSIEME_TERMINALI.has(fase);
}

interface JobRecord {
  phase: string;
  progressCurrent: number;
  progressTotal: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
  error: string | null;
}

function mapJob(job: JobRecord | null | undefined, adesso = Date.now()): StatoLavorazione | null {
  if (!job) return null;
  const fase = job.phase as FaseImport;
  const battito = job.heartbeatAt?.getTime() ?? job.startedAt?.getTime() ?? null;
  return {
    fase,
    fatto: job.progressCurrent,
    totale: job.progressTotal,
    percentuale:
      job.progressTotal > 0
        ? Math.min(100, Math.round((job.progressCurrent / job.progressTotal) * 100))
        : null,
    iniziatoIl: job.startedAt?.toISOString() ?? null,
    finitoIl: job.finishedAt?.toISOString() ?? null,
    ultimoSegnoDiVita: job.heartbeatAt?.toISOString() ?? null,
    errore: job.error,
    interrotto: !faseTerminale(fase) && battito !== null && adesso - battito > SCADENZA_BATTITO_MS,
  };
}

const LIST_SELECT = {
  id: true,
  supplierId: true,
  scopeLabel: true,
  documentType: true,
  mode: true,
  originalFilename: true,
  pageCount: true,
  status: true,
  uploadedAt: true,
  appliedAt: true,
  error: true,
  stats: true,
  extractorVersion: true,
  supplier: { select: { name: true } },
  job: {
    select: {
      phase: true,
      progressCurrent: true,
      progressTotal: true,
      startedAt: true,
      finishedAt: true,
      heartbeatAt: true,
      error: true,
    },
  },
  _count: { select: { rows: true } },
} as const;

interface ListRecord {
  id: string;
  supplierId: string;
  scopeLabel: string;
  documentType: string;
  mode: string;
  originalFilename: string;
  pageCount: number | null;
  status: string;
  uploadedAt: Date;
  appliedAt: Date | null;
  error: string | null;
  stats: unknown;
  extractorVersion: string | null;
  supplier: { name: string };
  job: JobRecord | null;
  _count: { rows: number };
}

interface Statistiche {
  prodotti?: number;
  sezioni?: number;
  ignote?: number;
  colonne?: number[];
  intestazioniScartate?: number;
  continuazioniUnite?: number;
  fonteProfilo?: PriceListDetail['fonteProfilo'];
  confermate?: number;
  smentite?: number;
  importabili?: number;
  conErrori?: number;
  conAvvisi?: number;
  chiamateIa?: number;
  costoUsd?: number;
}

function statistiche(grezze: unknown): Statistiche {
  return grezze && typeof grezze === 'object' ? (grezze as Statistiche) : {};
}

function mapList(record: ListRecord): PriceListItem {
  const stats = statistiche(record.stats);
  return {
    id: record.id,
    supplierId: record.supplierId,
    supplierName: record.supplier.name,
    scopeLabel: record.scopeLabel,
    documentType: record.documentType,
    mode: record.mode,
    originalFilename: record.originalFilename,
    pageCount: record.pageCount,
    status: record.status as StatoListino,
    uploadedAt: record.uploadedAt.toISOString(),
    appliedAt: record.appliedAt?.toISOString() ?? null,
    errore: record.error,
    righe: record._count.rows,
    prodotti: stats.prodotti ?? 0,
    lavorazione: mapJob(record.job),
  };
}

const GIORNO_MS = 24 * 60 * 60 * 1000;

export function priceListsRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  return {
    async list(query: PriceListListQuery): Promise<{ items: PriceListItem[]; totale: number }> {
      const where = {
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.q
          ? {
              OR: [
                { scopeLabel: { contains: query.q, mode: 'insensitive' as const } },
                { originalFilename: { contains: query.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(query.status === 'in-corso'
          ? { job: { is: { phase: { notIn: [...FASI_TERMINALI] } } } }
          : {}),
        ...(query.status === 'pronti' ? { job: { is: { phase: 'DONE' as const } } } : {}),
        ...(query.status === 'falliti'
          ? { job: { is: { phase: { in: ['FAILED' as const, 'CANCELLED' as const] } } } }
          : {}),
      };

      const [records, totale] = await Promise.all([
        db.priceList.findMany({
          where,
          select: LIST_SELECT,
          orderBy: { uploadedAt: 'desc' },
          take: 100,
        }),
        db.priceList.count({ where }),
      ]);
      return { items: (records as unknown as ListRecord[]).map(mapList), totale };
    },

    async get(id: string): Promise<PriceListDetail | null> {
      const record = (await db.priceList.findFirst({
        where: { id },
        select: LIST_SELECT,
      })) as unknown as ListRecord | null;
      if (!record) return null;
      const stats = statistiche(record.stats);
      return {
        ...mapList(record),
        colonne: stats.colonne ?? [],
        intestazioniScartate: stats.intestazioniScartate ?? 0,
        continuazioniUnite: stats.continuazioniUnite ?? 0,
        extractorVersion: record.extractorVersion,
        fonteProfilo: stats.fonteProfilo ?? null,
        righeCheConfermano: stats.confermate ?? 0,
        righeCheSmentiscono: stats.smentite ?? 0,
        importabili: stats.importabili ?? 0,
        conErrori: stats.conErrori ?? 0,
        conAvvisi: stats.conAvvisi ?? 0,
        chiamateIa: stats.chiamateIa ?? 0,
        costoUsd: stats.costoUsd ?? 0,
      };
    },

    /**
     * Le coperture già usate da un fornitore, con quanto sono ferme.
     *
     * È ciò che l'interfaccia mostra **prima** del caricamento: «Cecconi /
     * liquori — ultimo caricamento 28/02/2025, 187 prodotti». Serve a due
     * cose insieme: far vedere cosa si sta per sostituire, e suggerire i nomi
     * già in uso, così non nascono «liquori», «Liquori» e «liquori-cecconi»
     * come tre coperture diverse dello stesso scaffale.
     */
    async coperture(supplierId: string): Promise<CoperturaEsistente[]> {
      const records = (await db.priceList.findMany({
        where: { supplierId },
        select: { scopeLabel: true, uploadedAt: true, stats: true },
        orderBy: { uploadedAt: 'desc' },
        take: 200,
      })) as unknown as { scopeLabel: string; uploadedAt: Date; stats: unknown }[];

      const per = new Map<string, CoperturaEsistente>();
      for (const record of records) {
        const esistente = per.get(record.scopeLabel);
        if (esistente) {
          esistente.listini += 1;
          continue;
        }
        per.set(record.scopeLabel, {
          scopeLabel: record.scopeLabel,
          ultimoCaricamento: record.uploadedAt.toISOString(),
          giorniFermo: Math.floor((Date.now() - record.uploadedAt.getTime()) / GIORNO_MS),
          prodotti: statistiche(record.stats).prodotti ?? 0,
          listini: 1,
        });
      }
      return [...per.values()].sort((a, b) => a.scopeLabel.localeCompare(b.scopeLabel, 'it'));
    },

    /**
     * Registra un listino appena caricato e mette in coda il suo job.
     *
     * Le due scritture stanno in una transazione: un listino senza job
     * resterebbe fermo su `UPLOADED` per sempre, e nessuno saprebbe perché.
     */
    async crea(input: {
      dati: PriceListUpload;
      originalFilename: string;
      storagePath: string;
      fileHash: string;
      uploadedById: string | null;
    }): Promise<string> {
      const fornitore = await db.supplier.findFirst({
        where: { id: input.dati.supplierId },
        select: { id: true, name: true, active: true },
      });
      if (!fornitore) {
        throw new PriceListValidationError('Il fornitore indicato non esiste.', {
          supplierId: ['Scegli un fornitore fra quelli in anagrafica.'],
        });
      }

      const gemello = await db.priceList.findFirst({
        where: { supplierId: fornitore.id, fileHash: input.fileHash },
        select: { id: true, scopeLabel: true, uploadedAt: true, originalFilename: true },
      });
      if (gemello) {
        // Lo stesso file, dallo stesso fornitore: caricarlo di nuovo
        // creerebbe un doppione e, dalla Fase 10, un secondo giro di
        // aggiornamenti prezzi identici allo storico.
        throw new PriceListConflictError(
          `Questo file è già stato caricato per ${fornitore.name} il ` +
            `${gemello.uploadedAt.toLocaleDateString('it-IT')} come «${gemello.scopeLabel}».`,
          { priceListId: gemello.id, scopeLabel: gemello.scopeLabel },
        );
      }

      // Il job nasce annidato dentro il listino, in una scrittura sola: un
      // listino senza job resterebbe fermo su UPLOADED per sempre, e nessuno
      // saprebbe perche'. E' anche l'unico modo di crearlo passando dal
      // client scoped, che i delegate senza organizationId non li espone.
      const listino = await db.priceList.create({
        data: {
          organizationId,
          supplierId: fornitore.id,
          scopeLabel: input.dati.scopeLabel,
          documentType: input.dati.documentType,
          mode: input.dati.mode,
          originalFilename: input.originalFilename,
          storagePath: input.storagePath,
          fileHash: input.fileHash,
          uploadedById: input.uploadedById,
          status: 'UPLOADED',
          job: { create: { phase: 'QUEUED', progressCurrent: 0, progressTotal: 0 } },
        },
        select: { id: true },
      });
      return listino.id;
    },

    async righe(id: string, query: RowsQuery): Promise<RigheListino> {
      const listino = await db.priceList.findFirst({ where: { id }, select: { id: true } });
      if (!listino) throw new PriceListNotFoundError('Listino non trovato.');

      const tipoDi = (extracted: unknown): RigaListino['tipo'] => {
        const t = (extracted as { tipo?: string } | null)?.tipo;
        return t === 'sezione' || t === 'ignota' ? t : 'prodotto';
      };

      // Le righe si leggono attraverso il listino e non dal loro delegate:
      // `price_list_row` non ha `organizationId`, quindi l'estensione di
      // scoping non potrebbe filtrarlo e il client non lo espone affatto.
      const conRighe = (await db.priceList.findFirst({
        where: { id },
        select: {
          rows: {
            where: query.pagina ? { pageNumber: query.pagina } : {},
            select: {
              id: true,
              pageNumber: true,
              lineNumber: true,
              rawText: true,
              rawCells: true,
              extracted: true,
            },
            orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }],
          },
        },
      })) as unknown as {
        rows: {
          id: string;
          pageNumber: number;
          lineNumber: number;
          rawText: string;
          rawCells: unknown;
          extracted: unknown;
        }[];
      } | null;
      const tutte = conRighe?.rows ?? [];

      const mappate: RigaListino[] = tutte.map((riga) => {
        const extra = (riga.extracted ?? {}) as {
          continuazioni?: string[];
          codici?: string[];
          sezione?: string | null;
          campi?: RigaListino['campi'];
        };
        return {
          id: riga.id,
          pagina: riga.pageNumber,
          numero: riga.lineNumber,
          tipo: tipoDi(riga.extracted),
          testo: riga.rawText,
          celle: Array.isArray(riga.rawCells) ? (riga.rawCells as RigaListino['celle']) : [],
          continuazioni: extra.continuazioni ?? [],
          codici: extra.codici ?? [],
          sezione: extra.sezione ?? null,
          campi: extra.campi ?? null,
        };
      });

      const filtrate =
        query.tipo === 'prodotto' ? mappate.filter((r) => r.tipo === 'prodotto') : mappate;

      return {
        items: filtrate.slice(query.salta, query.salta + query.limite),
        totale: filtrate.length,
        prodotti: mappate.filter((r) => r.tipo === 'prodotto').length,
        sezioni: mappate.filter((r) => r.tipo === 'sezione').length,
        ignote: mappate.filter((r) => r.tipo === 'ignota').length,
      };
    },

    /**
     * Annulla la lavorazione.
     *
     * Non cancella il listino né le righe già estratte: `CANCELLED` è uno
     * stato, non una rimozione. Chi ha fermato un import per sbaglio deve
     * poter vedere cosa era stato letto fin lì.
     */
    async annulla(id: string): Promise<void> {
      const listino = await db.priceList.findFirst({
        where: { id },
        select: { id: true, job: { select: { phase: true } } },
      });
      if (!listino) throw new PriceListNotFoundError('Listino non trovato.');
      if (listino.job && faseTerminale(listino.job.phase as FaseImport)) {
        throw new PriceListConflictError(
          'La lavorazione è già finita: non c’è nulla da annullare.',
        );
      }
      await transactionForOrganization(organizationId, async (tx) => {
        await tx.priceList.update({
          where: { id },
          data: {
            status: 'DISCARDED',
            job: { update: { phase: 'CANCELLED', finishedAt: new Date() } },
          },
        });
      });
    },
  };
}
