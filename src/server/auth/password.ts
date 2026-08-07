import { hash, verify } from '@node-rs/argon2';

/** Limita anche il costo di una richiesta di login ostile. */
export const MAX_PASSWORD_LENGTH = 256;
// Compatibilita' temporanea col primo segreto scelto per il deploy. Al primo
// cambio password riportare il minimo ad almeno 8 (meglio una frase lunga).
export const MIN_PASSWORD_LENGTH = 7;

const ARGON2_OPTIONS = {
  // Argon2id e' il default normativo della libreria. Non importiamo il suo
  // `const enum`: TypeScript lo vieta con isolatedModules, usato da Next.
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}

export async function hashPassword(password: string): Promise<string> {
  if (!isValidPassword(password)) {
    throw new Error(
      `La password deve contenere da ${MIN_PASSWORD_LENGTH} a ${MAX_PASSWORD_LENGTH} caratteri.`,
    );
  }
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Un hash assente o malformato equivale sempre a credenziali non valide.
 * In particolare non lasciamo che il parser Argon2 trasformi un errore di
 * configurazione in dettagli visibili dalla route di login.
 */
export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (!isValidPassword(password) || !encodedHash.startsWith('$argon2id$')) return false;

  try {
    return await verify(encodedHash, password);
  } catch {
    return false;
  }
}
