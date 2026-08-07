import type { ErroreMappato } from '@/server/http/api-response';

/** Gli errori della tassonomia e il codice HTTP con cui escono. */
export const ERRORI_TASSONOMIA: readonly ErroreMappato[] = [
  { nome: 'TaxonomyNotFoundError', status: 404 },
  { nome: 'TaxonomyConflictError', status: 409 },
  { nome: 'OrganizationScopeError', status: 400 },
];
