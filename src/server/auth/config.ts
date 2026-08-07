export class AuthConfigurationError extends Error {
  override readonly name = 'AuthConfigurationError';
}

const MIN_SESSION_SECRET_BYTES = 32;

type Environment = Readonly<Record<string, string | undefined>>;

export function getPasswordHash(environment: Environment = process.env): string {
  const passwordHash = environment.APP_PASSWORD_HASH;
  if (!passwordHash || !passwordHash.startsWith('$argon2id$')) {
    throw new AuthConfigurationError('APP_PASSWORD_HASH non configurato o non valido.');
  }
  return passwordHash;
}

export function getSessionSecret(environment: Environment = process.env): string {
  const sessionSecret = environment.SESSION_SECRET;
  if (!sessionSecret || Buffer.byteLength(sessionSecret, 'utf8') < MIN_SESSION_SECRET_BYTES) {
    throw new AuthConfigurationError(
      `SESSION_SECRET deve contenere almeno ${MIN_SESSION_SECRET_BYTES} byte.`,
    );
  }
  return sessionSecret;
}
