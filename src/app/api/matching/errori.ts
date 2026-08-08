import type { ErroreMappato } from '@/server/http/api-response';

export const ERRORI_ABBINAMENTO: readonly ErroreMappato[] = [
  { nome: 'MatchingNotFoundError', status: 404 },
  { nome: 'MatchingConflictError', status: 409 },
  { nome: 'OrganizationScopeError', status: 400 },
];
