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
];
