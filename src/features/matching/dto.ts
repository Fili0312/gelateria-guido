/**
 * Quello che l'interfaccia riceve sulle righe da abbinare.
 *
 * Ogni riga porta con sé **il perché** della proposta, non solo la proposta:
 * chi rivede deve poter capire in un colpo d'occhio se fidarsi, e «punteggio
 * 0,87 per somiglianza» è un'informazione diversa da «sinonimo già confermato».
 */

export interface CandidatoProposto {
  productId: string;
  nome: string;
  punteggio: number;
  trigram: number;
  /** `nome` o `alias`: da dove è arrivata la proposta. */
  via: string;
}

export interface RigaDaAbbinare {
  id: string;
  priceListId: string;
  listino: string;
  fornitore: string;
  pagina: number;
  /** La descrizione come l'ha scritta il fornitore. */
  descrizione: string;
  codice: string | null;
  /** Il nucleo normalizzato: è ciò che diventerà il sinonimo se si conferma. */
  nucleo: string;
  formato: string;
  prezzoNetto: string | null;
  stato: 'AUTO' | 'PENDING' | 'NEW';
  metodo: string | null;
  punteggio: number | null;
  motivo: string | null;
  /** Il prodotto proposto, quando ce n'è uno. */
  propostoId: string | null;
  propostoNome: string | null;
  candidati: CandidatoProposto[];
}

export interface CodaAbbinamento {
  items: RigaDaAbbinare[];
  daRivedere: number;
  automatici: number;
  nuovi: number;
  giaNoti: number;
}

export type MatchingApiBody<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string[]> };
