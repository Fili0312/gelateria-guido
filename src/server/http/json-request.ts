export const DEFAULT_MAX_JSON_BODY_BYTES = 64 * 1024;

export type JsonRequestErrorStatus = 400 | 413 | 415;

export class JsonRequestError extends Error {
  constructor(
    name: string,
    message: string,
    readonly status: JsonRequestErrorStatus,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = name;
  }
}

export class JsonRequestTooLargeError extends JsonRequestError {
  constructor() {
    super('JsonRequestTooLargeError', 'JSON request body exceeds the allowed size.', 413);
  }
}

export class JsonRequestUnsupportedMediaTypeError extends JsonRequestError {
  constructor() {
    super('JsonRequestUnsupportedMediaTypeError', 'Content-Type must be application/json.', 415);
  }
}

export class JsonRequestMalformedError extends JsonRequestError {
  constructor(cause?: unknown) {
    super(
      'JsonRequestMalformedError',
      'JSON request body is malformed.',
      400,
      cause === undefined ? undefined : { cause },
    );
  }
}

function assertValidLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer.');
  }
}

function assertJsonContentType(request: Request): void {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();

  if (mediaType !== 'application/json') {
    throw new JsonRequestUnsupportedMediaTypeError();
  }
}

function assertDeclaredLengthWithinLimit(request: Request, maxBytes: number): void {
  const contentLength = request.headers.get('content-length');
  if (contentLength === null) return;

  const normalizedLength = contentLength.trim();
  if (!/^\d+$/.test(normalizedLength)) {
    throw new JsonRequestMalformedError();
  }

  if (BigInt(normalizedLength) > BigInt(maxBytes)) {
    throw new JsonRequestTooLargeError();
  }
}

async function readLimitedUtf8Body(request: Request, maxBytes: number): Promise<string> {
  assertDeclaredLengthWithinLimit(request, maxBytes);
  if (request.body === null) return '';

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let totalBytes = 0;
  let text = '';

  try {
    reader = request.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Il rifiuto per dimensione non deve essere mascherato da un errore
          // della sorgente durante la cancellazione dello stream.
        }
        throw new JsonRequestTooLargeError();
      }

      text += decoder.decode(value, { stream: true });
    }

    return text + decoder.decode();
  } catch (error) {
    if (error instanceof JsonRequestError) throw error;
    throw new JsonRequestMalformedError(error);
  } finally {
    if (reader) {
      try {
        reader.releaseLock();
      } catch {
        // Un body gia' fallito non deve cambiare la classe dell'errore HTTP.
      }
    }
  }
}

/**
 * Legge un body JSON senza affidarsi a Request.json(), cosi' il limite viene
 * applicato ai byte ricevuti anche quando manca Content-Length.
 */
export async function readJsonRequest(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  assertValidLimit(maxBytes);
  assertJsonContentType(request);

  const text = await readLimitedUtf8Body(request, maxBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new JsonRequestMalformedError(error);
  }
}

function isSingleHeaderValue(value: string): boolean {
  return value.trim().length > 0 && !value.includes(',');
}

function originFromParts(protocol: string, host: string): string | null {
  const normalizedProtocol = protocol.trim().toLowerCase();
  const normalizedHost = host.trim();

  if (!/^(?:http|https)$/.test(normalizedProtocol)) return null;
  if (!isSingleHeaderValue(normalizedHost) || /[\s\\/?#@]/.test(normalizedHost)) return null;

  try {
    const url = new URL(`${normalizedProtocol}://${normalizedHost}`);
    if (
      url.protocol !== `${normalizedProtocol}:` ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== '' ||
      url.host === ''
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function normalizedRequestOrigin(request: Request): string | null {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return null;
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProtocol = request.headers.get('x-forwarded-proto');

  // Il proxy del progetto imposta sempre entrambi. Accettarne soltanto uno, o
  // scegliere un elemento da una catena separata da virgole, renderebbe
  // ambiguo quale origin stiamo autorizzando.
  if ((forwardedHost === null) !== (forwardedProtocol === null)) return null;
  if (forwardedHost !== null && forwardedProtocol !== null) {
    if (!isSingleHeaderValue(forwardedHost) || !isSingleHeaderValue(forwardedProtocol)) {
      return null;
    }
    return originFromParts(forwardedProtocol, forwardedHost);
  }

  const hostHeader = request.headers.get('host');
  if (hostHeader !== null && !isSingleHeaderValue(hostHeader)) return null;

  const protocol = requestUrl.protocol.replace(/:$/, '');
  const host = hostHeader?.trim() ?? requestUrl.host;
  return originFromParts(protocol, host);
}

function normalizedOriginHeader(origin: string): string | null {
  if (!isSingleHeaderValue(origin)) return null;

  try {
    const url = new URL(origin.trim());
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Verifica l'Origin delle richieste mutative. I client non-browser possono
 * ometterlo; quando e' presente deve coincidere esattamente con l'origin
 * pubblico ricostruito dagli header del proxy o, in locale, dalla richiesta.
 */
export function hasTrustedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;

  const suppliedOrigin = normalizedOriginHeader(origin);
  const expectedOrigin = normalizedRequestOrigin(request);
  return suppliedOrigin !== null && expectedOrigin !== null && suppliedOrigin === expectedOrigin;
}
