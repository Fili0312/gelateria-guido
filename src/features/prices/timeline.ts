/**
 * Pianificazione pura di un inserimento nello storico temporale.
 *
 * Il repository applica poi il piano in una transazione serializzabile. Qui
 * non ci sono tipi Prisma, cosi i casi difficili (retroattivi e correzioni
 * nello stesso giorno) restano testabili senza database.
 */

export interface TimelineRow {
  id: string;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
}

export interface TimelineInsertionPlan {
  effectiveRowId: string | null;
  closeRowId: string | null;
  newValidTo: string | null;
}

export function isAnnulledRow(row: Pick<TimelineRow, 'validFrom' | 'validTo'>): boolean {
  return row.validTo === row.validFrom;
}

/** Le righe sono ordinate per data di inizio e, a parita, per creazione. */
export function sortTimeline<T extends TimelineRow>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => a.validFrom.localeCompare(b.validFrom) || a.createdAt.localeCompare(b.createdAt),
  );
}

export function effectiveRowAt<T extends TimelineRow>(rows: readonly T[], day: string): T | null {
  const candidates = sortTimeline(rows).filter(
    (row) =>
      !isAnnulledRow(row) && row.validFrom <= day && (row.validTo === null || row.validTo > day),
  );
  return candidates.at(-1) ?? null;
}

export function planTimelineInsertion(
  rows: readonly TimelineRow[],
  day: string,
): TimelineInsertionPlan {
  const ordered = sortTimeline(rows);
  const effective = effectiveRowAt(ordered, day);

  if (effective) {
    return {
      effectiveRowId: effective.id,
      closeRowId: effective.id,
      // Se si spezza un intervallo, il nuovo prezzo eredita la sua fine.
      // Vale anche per una sostituzione nello stesso giorno.
      newValidTo: effective.validTo,
    };
  }

  // In uno storico ben formato questo ramo serve solo prima del primo
  // prezzo. Gestire anche un eventuale buco rende comunque la riparazione
  // deterministica senza estendere a forza l'intervallo precedente.
  const successor = ordered.find((row) => !isAnnulledRow(row) && row.validFrom > day) ?? null;
  return {
    effectiveRowId: null,
    closeRowId: null,
    newValidTo: successor?.validFrom ?? null,
  };
}
