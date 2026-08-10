import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  businessCalendarDay,
  businessDayStart,
  isFutureBusinessDay,
  subtractCalendarDays,
} from './date';

describe('giorno operativo Europe/Rome', () => {
  it('usa il giorno italiano anche quando il server UTC e ancora al giorno prima', () => {
    const instant = new Date('2026-08-06T22:30:00.000Z');
    assert.equal(businessCalendarDay(instant), '2026-08-07');
    assert.equal(isFutureBusinessDay('2026-08-08', instant), true);
    assert.equal(isFutureBusinessDay('2026-08-07', instant), false);
    assert.equal(isFutureBusinessDay('2026-08-06', instant), false);
  });

  it('trova la mezzanotte italiana anche durante ora solare e legale', () => {
    assert.equal(businessDayStart('2026-01-10').toISOString(), '2026-01-09T23:00:00.000Z');
    assert.equal(businessDayStart('2026-08-10').toISOString(), '2026-08-09T22:00:00.000Z');
  });

  it('considera anche il cambio di giorno in ora solare', () => {
    assert.equal(businessCalendarDay(new Date('2026-01-01T23:30:00.000Z')), '2026-01-02');
  });

  it('sottrae giorni civili attraversando mesi, anni bisestili e cambio DST', () => {
    assert.equal(subtractCalendarDays('2024-03-01', 1), '2024-02-29');
    assert.equal(subtractCalendarDays('2026-04-15', 30), '2026-03-16');
    assert.equal(subtractCalendarDays('2026-01-01', 1), '2025-12-31');
  });
});
