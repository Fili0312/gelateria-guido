import type { ErroreMappato } from '@/server/http/api-response';

/**
 * Gli errori del catalogo e il codice HTTP con cui escono.
 *
 * Sta in un file a parte perché lo usano sette route: elencarlo in ognuna
 * significherebbe, prima o poi, lo stesso conflitto che risponde 409 da una
 * parte e 400 dall'altra.
 */
export const ERRORI_CATALOGO: readonly ErroreMappato[] = [
  { nome: 'ProductNotFoundError', status: 404 },
  { nome: 'ProductConflictError', status: 409 },
  {
    nome: 'ProductValidationError',
    status: 400,
    fields: (errore) => (errore as { fields?: Record<string, string[]> }).fields,
  },
  { nome: 'SupplierProductNotFoundError', status: 404 },
  { nome: 'SupplierProductConflictError', status: 409 },
  {
    nome: 'SupplierProductValidationError',
    status: 400,
    fields: (errore) => (errore as { fields?: Record<string, string[]> }).fields,
  },
  { nome: 'OrganizationScopeError', status: 400 },
];
