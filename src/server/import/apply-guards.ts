/**
 * Controlli puri che precedono qualunque scrittura dell'import.
 *
 * Restano in un modulo senza database perche' questi sono esattamente i casi
 * che non devono dipendere dalla UI: una chiamata diretta all'endpoint deve
 * ricevere lo stesso rifiuto del pulsante disabilitato.
 */

export interface RigaDaControllare {
  id: string;
  excluded: boolean;
  matchStatus: string;
  importabile?: boolean;
  validationErrors?: unknown;
}

export interface RigheBloccanti {
  pending: string[];
  nonImportabili: string[];
}

function contieneErrore(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (segnalazione) =>
        typeof segnalazione === 'object' &&
        segnalazione !== null &&
        'gravita' in segnalazione &&
        (segnalazione as { gravita?: unknown }).gravita === 'errore',
    )
  );
}

/** Gli avvisi sono deliberatamente applicabili; soltanto gli errori bloccano. */
export function trovaRigheBloccanti(righe: readonly RigaDaControllare[]): RigheBloccanti {
  const incluse = righe.filter((riga) => !riga.excluded);
  return {
    pending: incluse.filter((riga) => riga.matchStatus === 'PENDING').map((riga) => riga.id),
    nonImportabili: incluse
      .filter((riga) => riga.importabile === false || contieneErrore(riga.validationErrors))
      .map((riga) => riga.id),
  };
}

export function motivoStatoNonApplicabile(status: string, jobPhase: string | null): string | null {
  if (status !== 'REVIEW') {
    return `Il listino è in stato ${status}: si può applicare soltanto quando è in revisione.`;
  }
  if (jobPhase !== 'DONE') {
    return 'La lavorazione del listino non è conclusa: attendi che il job termini prima di applicare.';
  }
  return null;
}

/**
 * `PACKAGING_CHANGED` da solo non basta: una scrittura parziale o diretta al
 * DB non deve poter aggirare il blocco. Servono decisione umana e riferimento
 * esatto all'offerta che la riconciliazione sta per modificare.
 */
export function decisioneConfezioneApplicabile(
  riga: {
    proposedAction: string;
    matchStatus: string;
    supplierProductId: string | null;
    reviewedAt: Date | null;
    reviewedById: string | null;
  },
  supplierProductId: string | null,
): boolean {
  return (
    supplierProductId !== null &&
    riga.proposedAction === 'PACKAGING_CHANGED' &&
    riga.matchStatus === 'CONFIRMED' &&
    riga.supplierProductId === supplierProductId &&
    riga.reviewedAt !== null &&
    riga.reviewedById !== null
  );
}
