import { z } from 'zod';

/**
 * Mattoni zod condivisi fra le anagrafiche.
 *
 * Nati per i fornitori (Fase 4) ed estratti qui quando sono serviti anche al
 * catalogo (Fase 5). Tenerne due copie significherebbe, prima o poi, due
 * regole diverse per la stessa cosa — per esempio una stringa vuota salvata
 * come `''` da una parte e come `NULL` dall'altra.
 */

export const MAX_QUERY_LENGTH = 100;
const MAX_DECIMAL_INPUT_LENGTH = 32;

/**
 * I campi opzionali arrivano dai form come stringhe vuote. Nel dominio una
 * stringa vuota non porta informazione, quindi viene sempre salvata come NULL.
 */
export const trimmedStringOrNull = z.union([z.string(), z.null()]).transform((value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
});

export function nullableTrimmedString(maxLength: number, label: string) {
  return trimmedStringOrNull.pipe(
    z.union([
      z.string().max(maxLength, `${label} può contenere al massimo ${maxLength} caratteri.`),
      z.null(),
    ]),
  );
}

export function nullableEmail(label: string, maxLength = 254) {
  return trimmedStringOrNull.pipe(
    z.union([
      z.email({ error: `${label} non è valida.` }).max(maxLength, `${label} è troppo lunga.`),
      z.null(),
    ]),
  );
}

/** Forma canonica di un decimale: niente zeri inutili davanti o in coda. */
export function canonicalDecimal(value: string): string {
  const normalized = value.trim().replace(',', '.');
  const [rawInteger = '', rawFraction = ''] = normalized.split('.');
  const integer = rawInteger.replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  return fraction === '' ? integer : `${integer}.${fraction}`;
}

interface OpzioniDecimale {
  /** Cifre decimali ammesse. I prezzi ne vogliono 2, i formati fino a 4. */
  decimali?: number;
  /** Tetto espresso nell'unità minima (centesimi per 2 decimali). */
  massimo: bigint;
  /** Se `false`, lo zero non è ammesso: serve dove zero non ha senso. */
  ammettiZero?: boolean;
}

function parseDecimale(
  value: string,
  label: string,
  opzioni: OpzioniDecimale,
  context: z.RefinementCtx,
): string | typeof z.NEVER {
  const decimali = opzioni.decimali ?? 2;
  const normalized = value.trim().replace(',', '.');
  const forma = new RegExp(`^\\d+(?:\\.\\d{1,${decimali}})?$`);

  if (normalized.length > MAX_DECIMAL_INPUT_LENGTH || !forma.test(normalized)) {
    context.addIssue({
      code: 'custom',
      message:
        `${label} deve essere un numero decimale non negativo ` +
        `con al massimo ${decimali} ${decimali === 1 ? 'cifra decimale' : 'cifre decimali'}.`,
    });
    return z.NEVER;
  }

  const canonical = canonicalDecimal(normalized);
  const [integer = '0', fraction = ''] = canonical.split('.');
  const unita = BigInt(integer) * 10n ** BigInt(decimali) + BigInt(fraction.padEnd(decimali, '0'));

  if (unita > opzioni.massimo) {
    context.addIssue({ code: 'custom', message: `${label} supera il valore massimo consentito.` });
    return z.NEVER;
  }
  if (unita === 0n && opzioni.ammettiZero === false) {
    context.addIssue({ code: 'custom', message: `${label} deve essere maggiore di zero.` });
    return z.NEVER;
  }

  return canonical;
}

/** Decimale opzionale: stringa vuota o null diventano NULL. */
export function nullableDecimal(massimo: bigint, label: string, decimali = 2) {
  return z.union([z.string(), z.null()]).transform((value, context): string | null => {
    if (value === null || value.trim() === '') return null;
    return parseDecimale(value, label, { massimo, decimali }, context);
  });
}

/** Decimale obbligatorio e maggiore di zero. */
export function requiredPositiveDecimal(massimo: bigint, label: string, decimali = 2) {
  return z.string().transform((value, context): string => {
    if (value.trim() === '') {
      context.addIssue({ code: 'custom', message: `${label} è obbligatorio.` });
      return z.NEVER;
    }
    return parseDecimale(value, label, { massimo, decimali, ammettiZero: false }, context);
  });
}
