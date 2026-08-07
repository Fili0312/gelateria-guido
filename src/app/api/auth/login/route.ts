import { NextResponse } from 'next/server';
import { prismaForOrganization } from '@/server/db';
import { DEFAULT_ORGANIZATION_SLUG } from '@/server/database/organization-scope';
import { systemPrisma } from '@/server/database/system-client';
import { AuthConfigurationError, getPasswordHash, getSessionSecret } from '@/server/auth/config';
import { setSessionCookie } from '@/server/auth/cookie';
import {
  clearLoginAttempts,
  consumeLoginAttempt,
  loginClientKey,
} from '@/server/auth/login-rate-limit';
import { LoginBodyTooLargeError, readLoginPassword } from '@/server/auth/login-request';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, verifyPassword } from '@/server/auth/password';
import { createSessionToken } from '@/server/auth/session-token';

export const dynamic = 'force-dynamic';

function jsonError(error: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { ...headers, 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  let password: string | null;
  try {
    password = await readLoginPassword(request);
  } catch (error) {
    if (error instanceof LoginBodyTooLargeError) {
      return jsonError('Richiesta troppo grande.', 413);
    }
    throw error;
  }
  if (
    password === null ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return jsonError('Inserire una password valida.', 400);
  }

  let passwordHash: string;
  let sessionSecret: string;
  try {
    passwordHash = getPasswordHash();
    sessionSecret = getSessionSecret();
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return jsonError('Autenticazione non configurata.', 503);
    }
    throw error;
  }

  const clientKey = loginClientKey(request.headers);
  const rateLimit = consumeLoginAttempt(clientKey);
  if (!rateLimit.allowed) {
    return jsonError('Troppi tentativi. Attendi un minuto e riprova.', 429, {
      'Retry-After': String(rateLimit.retryAfterSeconds),
    });
  }

  if (!(await verifyPassword(password, passwordHash))) {
    return jsonError('Password non corretta.', 401);
  }
  clearLoginAttempts(clientKey);

  try {
    const organization = await systemPrisma.organization.findUnique({
      where: { slug: DEFAULT_ORGANIZATION_SLUG },
      select: { id: true },
    });
    if (!organization) return jsonError('Organizzazione non configurata.', 503);

    const scopedPrisma = prismaForOrganization(organization.id);
    const user = await scopedPrisma.user.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, organizationId: true, name: true, role: true },
    });
    if (!user) return jsonError('Utente applicativo non configurato.', 503);

    await scopedPrisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = createSessionToken(
      { userId: user.id, organizationId: user.organizationId },
      sessionSecret,
    );
    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, role: user.role },
    });
    response.headers.set('Cache-Control', 'no-store');
    setSessionCookie(response, token);
    return response;
  } catch {
    return jsonError('Autenticazione temporaneamente non disponibile.', 503);
  }
}
