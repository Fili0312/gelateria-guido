import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { SupplierApiErrorBody, SupplierApiSuccessBody } from '@/features/suppliers/dto';
import { supplierInputSchema, supplierListQuerySchema } from '@/features/suppliers/schema';
import { getCurrentUser } from '@/server/auth';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  JsonRequestError,
  readJsonRequest,
} from '@/server/http/json-request';
import {
  SupplierNameConflictError,
  SupplierValidationError,
  suppliersRepository,
} from '@/server/repositories/suppliers';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function jsonSuccess<T>(data: T, status = 200) {
  const body: SupplierApiSuccessBody<T> = { ok: true, data };
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function jsonError(
  error: string,
  status: number,
  details: Pick<SupplierApiErrorBody, 'fields' | 'canDeactivate'> = {},
) {
  const body: SupplierApiErrorBody = { ok: false, error, ...details };
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

function jsonRequestMessage(error: JsonRequestError): string {
  if (error.status === 413) return 'La richiesta supera il limite consentito di 64 KiB.';
  if (error.status === 415) return 'È richiesto il Content-Type application/json.';
  return 'Il corpo JSON della richiesta non è valido.';
}

function mappedErrorResponse(error: unknown, validationMessage: string) {
  if (error instanceof JsonRequestError) {
    return jsonError(jsonRequestMessage(error), error.status);
  }
  if (error instanceof ZodError) {
    return jsonError(validationMessage, 400, { fields: zodFieldErrors(error) });
  }
  if (error instanceof SupplierValidationError) {
    return jsonError(error.message, 400, { fields: error.fields });
  }
  if (error instanceof SupplierNameConflictError) {
    return jsonError(error.message, 409);
  }
  return jsonError('Non è stato possibile completare la richiesta.', 500);
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
    const query = supplierListQuerySchema.parse(rawQuery);
    const suppliers = await suppliersRepository(user.organizationId).list(query);
    return jsonSuccess(suppliers);
  } catch (error) {
    return mappedErrorResponse(error, 'I filtri richiesti non sono validi.');
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const rawInput = await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES);
    const input = supplierInputSchema.parse(rawInput);
    const supplier = await suppliersRepository(user.organizationId).create(input);
    return jsonSuccess(supplier, 201);
  } catch (error) {
    return mappedErrorResponse(error, 'I dati del fornitore non sono validi.');
  }
}
