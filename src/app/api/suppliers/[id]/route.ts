import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { SupplierApiErrorBody, SupplierApiSuccessBody } from '@/features/suppliers/dto';
import { supplierPatchSchema } from '@/features/suppliers/schema';
import { getCurrentUser } from '@/server/auth';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  JsonRequestError,
  readJsonRequest,
} from '@/server/http/json-request';
import {
  SupplierDeleteBlockedError,
  SupplierNameConflictError,
  SupplierNotFoundError,
  SupplierValidationError,
  suppliersRepository,
} from '@/server/repositories/suppliers';

export const dynamic = 'force-dynamic';

type SupplierRouteContext = { params: Promise<{ id: string }> };

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function jsonSuccess<T>(data: T, status = 200) {
  const body: SupplierApiSuccessBody<T> = { ok: true, data };
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function jsonError(
  error: string,
  status: number,
  details: Pick<SupplierApiErrorBody, 'fields' | 'canDeactivate' | 'counts'> = {},
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
  if (error instanceof SupplierNotFoundError) {
    return jsonError(error.message, 404);
  }
  if (error instanceof SupplierNameConflictError) {
    return jsonError(error.message, 409);
  }
  if (error instanceof SupplierDeleteBlockedError) {
    return jsonError(error.message, 409, { canDeactivate: true, counts: error.counts });
  }
  return jsonError('Non è stato possibile completare la richiesta.', 500);
}

export async function GET(_request: Request, context: SupplierRouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);

    const { id } = await context.params;
    const supplier = await suppliersRepository(user.organizationId).findDetail(id);
    if (!supplier) throw new SupplierNotFoundError('Fornitore non trovato.');
    return jsonSuccess(supplier);
  } catch (error) {
    return mappedErrorResponse(error, 'La richiesta non è valida.');
  }
}

export async function PATCH(request: Request, context: SupplierRouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    const rawPatch = await readJsonRequest(request, DEFAULT_MAX_JSON_BODY_BYTES);
    const patch = supplierPatchSchema.parse(rawPatch);
    const supplier = await suppliersRepository(user.organizationId).update(id, patch);
    return jsonSuccess(supplier);
  } catch (error) {
    return mappedErrorResponse(error, 'I dati del fornitore non sono validi.');
  }
}

export async function DELETE(request: Request, context: SupplierRouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError('Autenticazione richiesta.', 401);
    if (!hasTrustedMutationOrigin(request)) {
      return jsonError('Origine della richiesta non consentita.', 403);
    }

    const { id } = await context.params;
    await suppliersRepository(user.organizationId).delete(id);
    return jsonSuccess({ id });
  } catch (error) {
    return mappedErrorResponse(error, 'La richiesta non è valida.');
  }
}
