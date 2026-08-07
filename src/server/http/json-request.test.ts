import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  hasTrustedMutationOrigin,
  JsonRequestError,
  JsonRequestMalformedError,
  JsonRequestTooLargeError,
  JsonRequestUnsupportedMediaTypeError,
  readJsonRequest,
} from './json-request';

function jsonRequest(body: BodyInit | null, headers: HeadersInit = {}): Request {
  return new Request('https://example.test/api/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

function chunkedJsonRequest(chunks: Uint8Array[]): Request {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });

  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    duplex: 'half',
  };
  return new Request('https://example.test/api/suppliers', init);
}

describe('readJsonRequest', () => {
  it('legge JSON con media type case-insensitive e parametri', async () => {
    const request = jsonRequest('{"name":"Barzelli","active":true}', {
      'Content-Type': 'Application/JSON; Charset=UTF-8',
    });

    assert.deepEqual(await readJsonRequest(request), { name: 'Barzelli', active: true });
  });

  it('restituisce anche valori JSON primitivi', async () => {
    assert.equal(await readJsonRequest(jsonRequest('null')), null);
    assert.equal(await readJsonRequest(jsonRequest('42')), 42);
  });

  it('rifiuta Content-Type assente o diverso da application/json con 415', async () => {
    const missing = new Request('https://example.test/api/suppliers', {
      method: 'POST',
      body: new Uint8Array([123, 125]),
    });
    const text = new Request('https://example.test/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    const jsonSuffix = new Request('https://example.test/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/problem+json' },
      body: '{}',
    });

    for (const request of [missing, text, jsonSuffix]) {
      await assert.rejects(
        () => readJsonRequest(request),
        (error: unknown) =>
          error instanceof JsonRequestUnsupportedMediaTypeError &&
          error instanceof JsonRequestError &&
          error.status === 415,
      );
    }
  });

  it('rifiuta subito un Content-Length dichiarato oltre il limite con 413', async () => {
    const request = jsonRequest('{}', { 'Content-Length': '11' });

    await assert.rejects(
      () => readJsonRequest(request, 10),
      (error: unknown) =>
        error instanceof JsonRequestTooLargeError &&
        error instanceof JsonRequestError &&
        error.status === 413,
    );
  });

  it('rifiuta un body chunked oltre il limite contando i byte reali', async () => {
    const encoder = new TextEncoder();
    const request = chunkedJsonRequest([encoder.encode('{"a":'), encoder.encode('"gelato"}')]);

    await assert.rejects(() => readJsonRequest(request, 10), JsonRequestTooLargeError);
  });

  it('accetta un body grande esattamente quanto il limite', async () => {
    const body = '{"a":"e"}';
    const bytes = new TextEncoder().encode(body);
    const request = chunkedJsonRequest([bytes.subarray(0, 4), bytes.subarray(4)]);

    assert.deepEqual(await readJsonRequest(request, bytes.byteLength), { a: 'e' });
  });

  it('applica il limite ai byte UTF-8 e non al numero di caratteri', async () => {
    const body = '{"gusto":"crema è"}';
    const bytes = new TextEncoder().encode(body);

    await assert.rejects(
      () => readJsonRequest(chunkedJsonRequest([bytes]), body.length),
      JsonRequestTooLargeError,
    );
  });

  it('rifiuta Content-Length ambiguo o malformato con 400', async () => {
    for (const contentLength of ['1, 2', '-1', '1.5', 'abc']) {
      const request = jsonRequest('{}', { 'Content-Length': contentLength });
      await assert.rejects(
        () => readJsonRequest(request),
        (error: unknown) =>
          error instanceof JsonRequestMalformedError &&
          error instanceof JsonRequestError &&
          error.status === 400,
      );
    }
  });

  it('rifiuta JSON sintatticamente malformato o vuoto con 400', async () => {
    for (const body of ['{', '']) {
      await assert.rejects(
        () => readJsonRequest(jsonRequest(body)),
        (error: unknown) => error instanceof JsonRequestMalformedError && error.status === 400,
      );
    }
  });

  it('rifiuta byte che non formano UTF-8 valido con 400', async () => {
    const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0xc3, 0x28, 0x7d]);

    await assert.rejects(
      () => readJsonRequest(jsonRequest(invalidUtf8)),
      (error: unknown) =>
        error instanceof JsonRequestMalformedError &&
        error.status === 400 &&
        error.cause instanceof TypeError,
    );
  });

  it('usa un limite predefinito ed evita limiti non validi', async () => {
    const oversized = `"${'x'.repeat(DEFAULT_MAX_JSON_BODY_BYTES)}"`;
    await assert.rejects(() => readJsonRequest(jsonRequest(oversized)), JsonRequestTooLargeError);

    for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await assert.rejects(() => readJsonRequest(jsonRequest('{}'), limit), RangeError);
    }
  });
});

describe('hasTrustedMutationOrigin', () => {
  it('accetta una richiesta senza Origin', () => {
    const request = new Request('https://example.test/api/suppliers', {
      method: 'POST',
      headers: {
        'X-Forwarded-Host': 'valore, ambiguo',
        'X-Forwarded-Proto': 'https',
      },
    });

    assert.equal(hasTrustedMutationOrigin(request), true);
  });

  it('accetta lo stesso origin diretto, normalizzando case e porta predefinita', () => {
    const request = new Request('https://example.test:443/api/suppliers', {
      method: 'POST',
      headers: { Origin: 'HTTPS://EXAMPLE.TEST/' },
    });

    assert.equal(hasTrustedMutationOrigin(request), true);
  });

  it('usa Host quando presente nelle richieste dirette', () => {
    const request = new Request('http://127.0.0.1:3030/api/suppliers', {
      method: 'POST',
      headers: { Host: 'localhost:3030', Origin: 'http://localhost:3030' },
    });

    assert.equal(hasTrustedMutationOrigin(request), true);
  });

  it('accetta l origin pubblico fornito da un proxy con header singoli', () => {
    const request = new Request('http://127.0.0.1:3030/gelateria/api/suppliers', {
      method: 'POST',
      headers: {
        Origin: 'https://filippo.eventoyou.com',
        'X-Forwarded-Host': 'filippo.eventoyou.com',
        'X-Forwarded-Proto': 'https',
      },
    });

    assert.equal(hasTrustedMutationOrigin(request), true);
  });

  it('rifiuta mismatch di schema, host o porta', () => {
    for (const origin of [
      'http://example.test',
      'https://other.test',
      'https://example.test:444',
    ]) {
      const request = new Request('https://example.test/api/suppliers', {
        method: 'POST',
        headers: { Origin: origin },
      });
      assert.equal(hasTrustedMutationOrigin(request), false);
    }
  });

  it('rifiuta un Origin malformato, opaco o con credenziali e percorso', () => {
    for (const origin of [
      '',
      'null',
      'non-un-url',
      'https://user:password@example.test',
      'https://example.test/percorso',
      'https://example.test?query=1',
    ]) {
      const request = new Request('https://example.test/api/suppliers', {
        method: 'POST',
        headers: { Origin: origin },
      });
      assert.equal(hasTrustedMutationOrigin(request), false);
    }
  });

  it('rifiuta catene forwarded ambigue e valori forwarded non validi', () => {
    const invalidForwardedHeaders: HeadersInit[] = [
      {
        'X-Forwarded-Host': 'attacker.test, example.test',
        'X-Forwarded-Proto': 'https',
      },
      {
        'X-Forwarded-Host': 'example.test',
        'X-Forwarded-Proto': 'https, http',
      },
      {
        'X-Forwarded-Host': 'example.test/path',
        'X-Forwarded-Proto': 'https',
      },
      {
        'X-Forwarded-Host': 'example.test',
        'X-Forwarded-Proto': 'javascript',
      },
    ];

    for (const forwardedHeaders of invalidForwardedHeaders) {
      const request = new Request('http://127.0.0.1:3030/api/suppliers', {
        method: 'POST',
        headers: { Origin: 'https://example.test', ...forwardedHeaders },
      });
      assert.equal(hasTrustedMutationOrigin(request), false);
    }
  });

  it('rifiuta metadata forwarded incompleti invece di combinarli con dati locali', () => {
    const onlyHost = new Request('https://example.test/api/suppliers', {
      method: 'POST',
      headers: {
        Origin: 'https://example.test',
        'X-Forwarded-Host': 'example.test',
      },
    });
    const onlyProtocol = new Request('https://example.test/api/suppliers', {
      method: 'POST',
      headers: {
        Origin: 'https://example.test',
        'X-Forwarded-Proto': 'https',
      },
    });

    assert.equal(hasTrustedMutationOrigin(onlyHost), false);
    assert.equal(hasTrustedMutationOrigin(onlyProtocol), false);
  });

  it('rifiuta un Origin che non coincide con gli header pubblici del proxy', () => {
    const request = new Request('http://127.0.0.1:3030/api/suppliers', {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.test',
        'X-Forwarded-Host': 'filippo.eventoyou.com',
        'X-Forwarded-Proto': 'https',
      },
    });

    assert.equal(hasTrustedMutationOrigin(request), false);
  });
});
