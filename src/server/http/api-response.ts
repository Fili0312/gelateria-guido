import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestError } from './json-request';

/**
 * L'involucro delle risposte API.
 *
 * Nato nelle route dei fornitori (Fase 4) ed estratto qui quando le route
 * sono diventate sette: ogni copia in più è un'occasione perché due endpoint
 * rispondano in modo diverso allo stesso errore, e il client non può
 * permetterselo — deve poter leggere `ok` e `fields` sempre allo stesso modo.
 */

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export interface ApiErrorExtra {
  fields?: Record<string, string[]>;
  [chiave: string]: unknown;
}

export function jsonSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true as const, data }, { status, headers: NO_STORE_HEADERS });
}

export function jsonError(error: string, status: number, extra: ApiErrorExtra = {}) {
  return NextResponse.json(
    { ok: false as const, error, ...extra },
    { status, headers: NO_STORE_HEADERS },
  );
}

/** Gli errori zod diventano una mappa campo → messaggi, come li usa il form. */
export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

export function jsonRequestMessage(error: JsonRequestError): string {
  if (error.status === 413) return 'La richiesta supera il limite consentito di 64 KiB.';
  if (error.status === 415) return 'È richiesto il Content-Type application/json.';
  return 'Il corpo JSON della richiesta non è valido.';
}

/** Errore applicativo con un codice HTTP e, quando serve, i campi in errore. */
export interface ErroreMappato {
  nome: string;
  status: number;
  fields?: (errore: Error) => Record<string, string[]> | undefined;
}

/**
 * Traduce un errore in risposta.
 *
 * Il caso finale è deliberatamente muto: un errore non previsto diventa un
 * 500 con un messaggio generico, perché il testo di un'eccezione può
 * contenere frammenti di query o di dati e non deve uscire dal server.
 */
export function mappedErrorResponse(
  error: unknown,
  validationMessage: string,
  mappa: readonly ErroreMappato[] = [],
) {
  if (error instanceof JsonRequestError) {
    return jsonError(jsonRequestMessage(error), error.status);
  }
  if (error instanceof ZodError) {
    return jsonError(validationMessage, 400, { fields: zodFieldErrors(error) });
  }
  if (error instanceof Error) {
    const regola = mappa.find((r) => r.nome === error.name);
    if (regola) {
      const fields = regola.fields?.(error);
      return jsonError(error.message, regola.status, fields ? { fields } : {});
    }
  }
  console.error('Errore non gestito in una route API:', error);
  return jsonError('Non è stato possibile completare la richiesta.', 500);
}
