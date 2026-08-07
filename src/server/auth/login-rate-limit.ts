export const LOGIN_ATTEMPT_LIMIT = 8;
export const LOGIN_ATTEMPT_WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 10_000;
const OVERFLOW_CLIENT_KEY = 'troppi-client-distinti';

interface AttemptWindow {
  attempts: number;
  resetAt: number;
}

export interface LoginRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

type AttemptStore = Map<string, AttemptWindow>;

const globalForLoginRateLimit = globalThis as unknown as {
  gelateriaLoginAttempts?: AttemptStore;
};

const loginAttempts = globalForLoginRateLimit.gelateriaLoginAttempts ?? new Map();
globalForLoginRateLimit.gelateriaLoginAttempts = loginAttempts;

export function loginClientKey(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim();
  return realIp && realIp.length <= 64 ? realIp : 'connessione-diretta';
}

export function consumeLoginAttempt(
  key: string,
  now = Date.now(),
  store: AttemptStore = loginAttempts,
): LoginRateLimitResult {
  let effectiveKey = key;
  let current = store.get(effectiveKey);

  if (!current && store.size >= MAX_TRACKED_CLIENTS) {
    for (const [storedKey, window] of store) {
      if (window.resetAt <= now) store.delete(storedKey);
    }
  }

  if (!current && store.size >= MAX_TRACKED_CLIENTS) {
    effectiveKey = OVERFLOW_CLIENT_KEY;
    current = store.get(effectiveKey);
  }

  if (!current || current.resetAt <= now) {
    current = { attempts: 0, resetAt: now + LOGIN_ATTEMPT_WINDOW_MS };
    store.set(effectiveKey, current);
  }

  if (current.attempts >= LOGIN_ATTEMPT_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.attempts += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearLoginAttempts(key: string, store: AttemptStore = loginAttempts): void {
  if (!store.delete(key)) store.delete(OVERFLOW_CLIENT_KEY);
}
