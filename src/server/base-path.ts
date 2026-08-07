/**
 * Normalizza il prefisso pubblico configurato in Next.
 *
 * Questo modulo non importa Next e puo' essere usato da route handler,
 * Server Component e script. Il valore predefinito resta quello di produzione
 * per la stessa ragione documentata in next.config.mjs.
 */
export function normalizeBasePath(value: string | undefined): string {
  if (value === undefined) return '/gelateria';

  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '/') return '';

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

export function withBasePath(
  path: string,
  basePath = normalizeBasePath(process.env.NEXT_BASE_PATH),
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${normalizedPath}`;
}
