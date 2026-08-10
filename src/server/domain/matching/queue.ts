import type { RigaDaAbbinare } from '@/features/matching/dto';

/** Riga restituita dalla query paginata della coda. */
export interface RigaCodaGrezza {
  id: string;
  priceListId: string;
  listino: string;
  fornitore: string;
  pageNumber: number;
  rawText: string;
  extracted: unknown;
  validationErrors: unknown;
  matchStatus: string;
  productId: string | null;
  productName: string | null;
  reviewedAt: Date | null;
  bloccaImport: boolean;
}

interface RecordJson {
  [key: string]: unknown;
}

function record(value: unknown): RecordJson | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordJson)
    : null;
}

function stringa(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numero(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function problemiDi(
  validationErrors: unknown,
  descrizione: string | null,
  bloccaImport: boolean,
): string[] {
  const problemi = Array.isArray(validationErrors)
    ? validationErrors
        .map(record)
        .filter((errore): errore is RecordJson => errore?.gravita === 'errore')
        .map((errore) => stringa(errore.messaggio))
        .filter((messaggio): messaggio is string => messaggio !== null)
    : [];

  if (!descrizione && !problemi.some((problema) => /descrizione/i.test(problema))) {
    problemi.unshift('La riga non ha una descrizione strutturata.');
  }
  if (bloccaImport && problemi.length === 0) {
    problemi.push('Questa riga contiene dati che bloccano l’applicazione del listino.');
  }
  return [...new Set(problemi)];
}

function candidatiDi(value: unknown): RigaDaAbbinare['candidati'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const candidato = record(item);
    const productId = stringa(candidato?.productId);
    const nome = stringa(candidato?.nome);
    const punteggio = numero(candidato?.punteggio);
    const trigram = numero(candidato?.trigram);
    const via = stringa(candidato?.via);
    if (!productId || !nome || punteggio === null || trigram === null || !via) return [];
    return [{ productId, nome, punteggio, trigram, via }];
  });
}

function formatoLeggibile(campi: RecordJson | null): string {
  const unitSize = stringa(campi?.unitSize);
  const unitOfMeasure = stringa(campi?.unitOfMeasure);
  if (!unitSize || !unitOfMeasure) return '—';
  const unita = unitOfMeasure === 'PIECE' ? 'pz' : unitOfMeasure.toLowerCase();
  const packQuantity = numero(campi?.packQuantity);
  const pezzi = packQuantity !== null && packQuantity > 1 ? ` ×${packQuantity}` : '';
  return `${unitSize} ${unita}${pezzi}`;
}

/**
 * Traduce una riga della query nella DTO senza fidarsi del JSON estratto.
 *
 * Anche una riga malformata resta visibile: il testo grezzo diventa la sua
 * etichetta e l'operatore può almeno escluderla esplicitamente. Nasconderla
 * renderebbe impossibile sbloccare l'applicazione del listino.
 */
export function mappaRigaCoda(riga: RigaCodaGrezza): RigaDaAbbinare {
  const extra = record(riga.extracted);
  const campi = record(extra?.campi);
  const abbinamento = record(extra?.abbinamento);
  const descrizioneStrutturata = stringa(campi?.descrizione);
  const descrizione =
    descrizioneStrutturata ??
    stringa(riga.rawText) ??
    `Riga senza testo leggibile (pagina ${riga.pageNumber})`;

  const stati = new Set(['AUTO', 'PENDING', 'NEW', 'CONFIRMED', 'REJECTED', 'IGNORED']);
  const stato = stati.has(riga.matchStatus)
    ? (riga.matchStatus as RigaDaAbbinare['stato'])
    : 'PENDING';

  return {
    id: riga.id,
    priceListId: riga.priceListId,
    listino: riga.listino,
    fornitore: riga.fornitore,
    pagina: riga.pageNumber,
    descrizione,
    codice: stringa(campi?.codice),
    nucleo: stringa(abbinamento?.nucleo) ?? '',
    formato: formatoLeggibile(campi),
    prezzoNetto: stringa(campi?.prezzoNetto),
    stato,
    metodo: stringa(abbinamento?.metodo),
    punteggio: numero(abbinamento?.punteggio),
    motivo: stringa(abbinamento?.motivo),
    propostoId: riga.productId,
    propostoNome: riga.productName,
    candidati: candidatiDi(abbinamento?.candidati),
    problemi: problemiDi(riga.validationErrors, descrizioneStrutturata, riga.bloccaImport),
    giaRivista: riga.reviewedAt !== null,
    bloccaImport: riga.bloccaImport,
  };
}
