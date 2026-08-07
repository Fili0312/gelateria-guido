export type ClassValue = string | false | null | undefined;

/** Unisce classi opzionali senza introdurre una dipendenza per un caso semplice. */
export function cn(...values: readonly ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
