import { cookies } from 'next/headers';
import { cache } from 'react';
import type { UserRole } from '@/generated/prisma/enums';
import { prismaForOrganization } from '@/server/db';
import { AuthConfigurationError, getSessionSecret } from './config';
import { SESSION_COOKIE_NAME } from './cookie';
import { verifySessionToken } from './session-token';

export interface CurrentUser {
  id: string;
  organizationId: string;
  name: string;
  role: UserRole;
}

/** Verifica cookie, firma, scadenza, organizzazione e stato dell'utente. */
async function resolveCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  let secret: string;
  try {
    secret = getSessionSecret();
  } catch (error) {
    if (error instanceof AuthConfigurationError) return null;
    throw error;
  }

  const claims = verifySessionToken(token, secret);
  if (!claims) return null;

  return prismaForOrganization(claims.organizationId).user.findFirst({
    where: { id: claims.userId, active: true },
    select: { id: true, organizationId: true, name: true, role: true },
  });
}

/** Una sola verifica DB per render, anche se layout e pagina la richiedono. */
export const getCurrentUser = cache(resolveCurrentUser);
