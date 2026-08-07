import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
const CLOCK_SKEW_SECONDS = 60;
const TOKEN_VERSION = 'v1';
const MAX_TOKEN_LENGTH = 4096;

export interface SessionIdentity {
  userId: string;
  organizationId: string;
}

export interface SessionClaims extends SessionIdentity {
  issuedAt: number;
  expiresAt: number;
}

interface SerializedSession {
  v: 1;
  sub: string;
  org: string;
  iat: number;
  exp: number;
}

interface CreateSessionOptions {
  now?: Date;
  durationSeconds?: number;
}

function seconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function sign(value: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 191;
}

function isSerializedSession(value: unknown): value is SerializedSession {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SerializedSession>;

  return (
    payload.v === 1 &&
    isIdentifier(payload.sub) &&
    isIdentifier(payload.org) &&
    Number.isSafeInteger(payload.iat) &&
    Number.isSafeInteger(payload.exp)
  );
}

export function createSessionToken(
  identity: SessionIdentity,
  secret: string,
  options: CreateSessionOptions = {},
): string {
  if (!isIdentifier(identity.userId) || !isIdentifier(identity.organizationId)) {
    throw new Error('Identita di sessione non valida.');
  }

  const durationSeconds = options.durationSeconds ?? SESSION_DURATION_SECONDS;
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Durata della sessione non valida.');
  }

  const issuedAt = seconds(options.now ?? new Date());
  const payload: SerializedSession = {
    v: 1,
    sub: identity.userId,
    org: identity.organizationId,
    iat: issuedAt,
    exp: issuedAt + durationSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signedValue = `${TOKEN_VERSION}.${encodedPayload}`;
  const signature = sign(signedValue, secret).toString('base64url');

  return `${signedValue}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now = new Date(),
): SessionClaims | null {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [version, encodedPayload, encodedSignature] = parts;
  if (
    version !== TOKEN_VERSION ||
    !encodedPayload ||
    !encodedSignature ||
    !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
    !/^[A-Za-z0-9_-]+$/.test(encodedSignature)
  ) {
    return null;
  }

  const expectedSignature = sign(`${version}.${encodedPayload}`, secret);
  const receivedSignature = Buffer.from(encodedSignature, 'base64url');
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isSerializedSession(payload)) return null;

  const currentTime = seconds(now);
  if (
    payload.iat > currentTime + CLOCK_SKEW_SECONDS ||
    payload.exp <= currentTime ||
    payload.exp <= payload.iat
  ) {
    return null;
  }

  return {
    userId: payload.sub,
    organizationId: payload.org,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}
