import { trovaRigheBloccanti } from '@/server/import/apply-guards';

const STATI_DECIDIBILI = new Set(['AUTO', 'PENDING', 'NEW']);

export type StatoMatchingDecisione =
  'AUTO' | 'PENDING' | 'NEW' | 'CONFIRMED' | 'REJECTED' | 'IGNORED';

export interface StatoRigaDecisione {
  reviewedAt: Date | null;
  excluded: boolean;
  matchStatus: StatoMatchingDecisione;
}

export interface RigaPerBloccoImport {
  id: string;
  extracted: unknown;
  validationErrors: unknown;
  matchStatus: string;
  excluded: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Replica la selezione `tipo=prodotto` usata dall'anteprima autorevole. */
export function rigaBloccaApplicazione(riga: RigaPerBloccoImport): boolean {
  const extra = record(riga.extracted);
  if (extra?.tipo !== 'prodotto') return false;
  const campi = record(extra.campi);
  const importabile = campi ? campi.importabile : false;
  const bloccanti = trovaRigheBloccanti([
    {
      id: riga.id,
      excluded: riga.excluded,
      matchStatus: riga.matchStatus,
      importabile: typeof importabile === 'boolean' ? importabile : undefined,
      validationErrors: riga.validationErrors,
    },
  ]);
  return bloccanti.pending.length > 0 || bloccanti.nonImportabili.length > 0;
}

/** Il controllo viene eseguito dentro la stessa transazione della decisione. */
export function motivoDecisioneNonApplicabile(riga: StatoRigaDecisione): string | null {
  if (riga.reviewedAt) return 'Questa riga è già stata rivista.';
  if (riga.excluded) return 'Questa riga è già stata esclusa.';
  if (!STATI_DECIDIBILI.has(riga.matchStatus)) {
    return `Questa riga non è più decidibile (stato ${riga.matchStatus}).`;
  }
  return null;
}

/**
 * Condizione confronta-e-scambia della scrittura nested Prisma.
 *
 * Lo stato letto nella transazione fa da versione: se un'altra richiesta lo
 * cambia o conclude la revisione prima dell'UPDATE, la scrittura non trova
 * più la riga e perde senza produrre alias o altri effetti collaterali.
 */
export function condizioneCasDecisione(
  rigaId: string,
  matchStatus: StatoMatchingDecisione,
  reviewedAt: Date | null,
) {
  return { id: rigaId, reviewedAt, excluded: false, matchStatus };
}
