export const MAX_LOGIN_BODY_BYTES = 4096;

export class LoginBodyTooLargeError extends Error {
  override readonly name = 'LoginBodyTooLargeError';
}

async function readLimitedText(request: Request): Promise<string> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    if (Number(declaredLength) > MAX_LOGIN_BODY_BYTES) throw new LoginBodyTooLargeError();
  }

  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_LOGIN_BODY_BYTES) {
        await reader.cancel();
        throw new LoginBodyTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** Legge soltanto i due formati realmente usati dal form di accesso. */
export async function readLoginPassword(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();

  try {
    const body = await readLimitedText(request);

    if (contentType === 'application/json') {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object') return null;
      const password = (parsed as { password?: unknown }).password;
      return typeof password === 'string' ? password : null;
    }

    if (contentType === 'application/x-www-form-urlencoded') {
      const password = new URLSearchParams(body).get('password');
      return password;
    }
  } catch (error) {
    if (error instanceof LoginBodyTooLargeError) throw error;
    return null;
  }

  return null;
}
