import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSessionToken, verifySessionToken } from './session-token';

const SECRET = 'test-session-secret-longer-than-thirty-two-bytes';
const OTHER_SECRET = 'another-session-secret-longer-than-thirty-two';
const NOW = new Date('2026-08-07T12:00:00.000Z');

describe('token di sessione HMAC', () => {
  it('ricostruisce le claim firmate', () => {
    const token = createSessionToken({ userId: 'user-1', organizationId: 'org-1' }, SECRET, {
      now: NOW,
      durationSeconds: 600,
    });

    assert.deepEqual(verifySessionToken(token, SECRET, NOW), {
      userId: 'user-1',
      organizationId: 'org-1',
      issuedAt: 1_786_104_000,
      expiresAt: 1_786_104_600,
    });
  });

  it('rifiuta payload e firma alterati', () => {
    const token = createSessionToken({ userId: 'user-1', organizationId: 'org-1' }, SECRET, {
      now: NOW,
    });
    const [version, payload, signature] = token.split('.');
    assert.ok(version && payload && signature);

    const changedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
    const changedSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;

    assert.equal(
      verifySessionToken(`${version}.${changedPayload}.${signature}`, SECRET, NOW),
      null,
    );
    assert.equal(
      verifySessionToken(`${version}.${payload}.${changedSignature}`, SECRET, NOW),
      null,
    );
    assert.equal(verifySessionToken(token, OTHER_SECRET, NOW), null);
  });

  it('rifiuta token scaduti, futuri e malformati', () => {
    const shortToken = createSessionToken({ userId: 'user-1', organizationId: 'org-1' }, SECRET, {
      now: NOW,
      durationSeconds: 10,
    });
    const futureToken = createSessionToken({ userId: 'user-1', organizationId: 'org-1' }, SECRET, {
      now: new Date(NOW.getTime() + 120_000),
    });

    assert.equal(verifySessionToken(shortToken, SECRET, new Date(NOW.getTime() + 10_000)), null);
    assert.equal(verifySessionToken(futureToken, SECRET, NOW), null);
    assert.equal(verifySessionToken('v1.rotto', SECRET, NOW), null);
  });
});
