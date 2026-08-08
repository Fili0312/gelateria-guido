import type { ErroreMappato } from '@/server/http/api-response';

/** Gli errori dei listini e il codice HTTP con cui escono. */
export const ERRORI_LISTINI: readonly ErroreMappato[] = [
  { nome: 'PriceListNotFoundError', status: 404 },
  { nome: 'PriceListConflictError', status: 409 },
  {
    nome: 'PriceListValidationError',
    status: 400,
    fields: (errore) => (errore as { fields?: Record<string, string[]> }).fields,
  },
  { nome: 'StorageError', status: 400 },
  { nome: 'OrganizationScopeError', status: 400 },
];
