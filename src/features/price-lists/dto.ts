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
  /** I campi interpretati dalla Fase 8. `null` finché non è stata fatta, e
   *  sulle righe che non sono prodotti. */
  campi: CampiRiga | null;
}

export interface SegnalazioneRiga {
  campo: string;
  gravita: 'errore' | 'avviso';
  messaggio: string;
}

export interface CampiRiga {
  codice: string | null;
  descrizione: string | null;
  unitaDiVendita: string | null;
  prezzoListino: string | null;
  sconti: number[];
  prezzoNettoDichiarato: string | null;
  prezzoNettoCalcolato: string | null;
  prezzoNetto: string | null;
  iva: string | null;
  unitSize: string | null;
  unitOfMeasure: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
  contentPerPack: string | null;
  baseUnit: string | null;
  segnalazioni: SegnalazioneRiga[];
  importabile: boolean;
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
  /** Come si è arrivati al profilo delle colonne. `aritmetica` significa
   *  dimostrato dal conto che torna, `ia` significa proposto da un modello:
   *  sono due cose diverse e vanno mostrate diverse. */
  fonteProfilo: 'aritmetica' | 'indizi' | 'ia' | 'salvato' | null;
  righeCheConfermano: number;
  righeCheSmentiscono: number;
  importabili: number;
  conErrori: number;
  conAvvisi: number;
  chiamateIa: number;
  costoUsd: number;
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
  { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string[]> };
