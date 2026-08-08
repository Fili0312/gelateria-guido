/**
 * Quello che l'interfaccia riceve sui listini caricati.
 */

export type StatoListino =
  | 'UPLOADED'
  | 'EXTRACTING'
  | 'EXTRACTED'
  | 'STRUCTURING'
  | 'MATCHING'
  | 'REVIEW'
  | 'APPLYING'
  | 'APPLIED'
  | 'FAILED'
  | 'DISCARDED'
  | 'REVERTED';

export type FaseImport =
  | 'QUEUED'
  | 'EXTRACTING'
  | 'SEGMENTING'
  | 'STRUCTURING'
  | 'VALIDATING'
  | 'MATCHING'
  | 'DONE'
  | 'FAILED'
  | 'CANCELLED';

export interface StatoLavorazione {
  fase: FaseImport;
  fatto: number;
  totale: number;
  /** 0..100, arrotondato. `null` finché non si sa quanto è il totale. */
  percentuale: number | null;
  iniziatoIl: string | null;
  finitoIl: string | null;
  /** Ultimo segno di vita del processo. Serve a distinguere «sta lavorando»
   *  da «il servizio è morto e il job è rimasto appeso». */
  ultimoSegnoDiVita: string | null;
  errore: string | null;
  /** true quando la fase non è terminale e il segno di vita è vecchio. */
  interrotto: boolean;
}

export interface PriceListItem {
  id: string;
  supplierId: string;
  supplierName: string;
  scopeLabel: string;
  documentType: string;
  originalFilename: string;
  pageCount: number | null;
  status: StatoListino;
  uploadedAt: string;
  appliedAt: string | null;
  errore: string | null;
  righe: number;
  prodotti: number;
  lavorazione: StatoLavorazione | null;
}

export interface CellaEstratta {
  testo: string;
  colonna: number;
  x: number;
}

export interface RigaListino {
  id: string;
  pagina: number;
  numero: number;
  tipo: 'prodotto' | 'sezione' | 'ignota';
  testo: string;
  celle: CellaEstratta[];
  continuazioni: string[];
  /** Codici dichiarati su una riga a sé (`EAN: 20561`), tenuti fuori dalla
   *  descrizione perché nei listini Cecconi ripetono il codice articolo. */
  codici: string[];
  sezione: string | null;
}

export interface RigheListino {
  items: RigaListino[];
  totale: number;
  prodotti: number;
  sezioni: number;
  ignote: number;
}

export interface PriceListDetail extends PriceListItem {
  /** I bordi delle colonne riconosciute: mostrarli aiuta a capire *perché*
   *  una riga è finita fra le «non capite». */
  colonne: number[];
  intestazioniScartate: number;
  continuazioniUnite: number;
  extractorVersion: string | null;
}

/**
 * Una copertura già usata da questo fornitore.
 *
 * Serve a rispondere, **prima** di caricare, alla domanda «cosa sto per
 * sostituire»: mostrare dopo che l'import è partito significa mostrarlo
 * quando è troppo tardi per cambiare idea.
 */
export interface CoperturaEsistente {
  scopeLabel: string;
  ultimoCaricamento: string;
  /** Da quanti giorni quel listino è fermo. */
  giorniFermo: number;
  prodotti: number;
  listini: number;
}

export type PriceListApiBody<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string[]> };
