import type { ErroreMappato } from '@/server/http/api-response';

/**
 * Gli errori del dominio ordine, tradotti in risposte HTTP.
 *
 * Si mappano per **nome** e non per classe: questo modulo viaggia con le
 * rotte, e importare il repository qui tirerebbe dentro il client Prisma
 * anche dove non serve.
 */
export const ERRORI_ORDINE: readonly ErroreMappato[] = [
  { nome: 'OrderNotFoundError', status: 404 },
  { nome: 'OrderValidationError', status: 422 },
  { nome: 'OrderVersionError', status: 409 },
  // Un ordine senza righe, o un formato che non esiste: è una richiesta
  // sbagliata, non un guasto del server.
  { nome: 'GenerazioneError', status: 422 },
  { nome: 'DocumentiConflictError', status: 409 },
  { nome: 'ArchivioError', status: 422 },
  // La riga c'è e il file no: il server ha perso qualcosa, e va detto.
  { nome: 'DocumentiError', status: 500 },
  { nome: 'PdfError', status: 500 },
  { nome: 'PdfCapacityError', status: 429 },
  { nome: 'PdfTimeoutError', status: 504 },
];
