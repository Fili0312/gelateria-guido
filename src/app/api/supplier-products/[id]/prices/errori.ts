import type { ErroreMappato } from '@/server/http/api-response';

/** Errori applicativi ammessi dall'API dello storico prezzi. */
export const ERRORI_PREZZI: readonly ErroreMappato[] = [
  { nome: 'PriceHistoryNotFoundError', status: 404 },
  {
    nome: 'PriceHistoryValidationError',
    status: 400,
    fields: (errore) => (errore as { fields?: Record<string, string[]> }).fields,
  },
  { nome: 'OrganizationScopeError', status: 400 },
];
