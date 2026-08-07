const INTERNAL_ORIGIN = 'https://gelateria.invalid';

/** Accetta soltanto destinazioni relative alla stessa applicazione. */
export function safeNextPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return '/';

  try {
    const resolved = new URL(candidate, INTERNAL_ORIGIN);
    if (resolved.origin !== INTERNAL_ORIGIN) return '/';
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return '/';
  }
}
