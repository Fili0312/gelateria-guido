export const BUSINESS_TIME_ZONE = 'Europe/Rome';

const BUSINESS_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Giorno civile della gelateria, indipendente dal fuso orario del server. */
export function businessCalendarDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Primo istante UTC di un giorno civile della gelateria. */
export function businessDayStart(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Giorno civile non valido.');
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const targetAsUtc = Date.UTC(year, month - 1, date);

  // Intl espone il fuso, non l'offset. Si interpreta come UTC la stessa ora
  // civile per ricavare l'offset e si corregge una seconda volta: cosi' resta
  // giusto anche se il primo tentativo cade dall'altro lato di un cambio DST.
  const offsetAt = (instant: Date) => {
    const parts = BUSINESS_PARTS.formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    return (
      Date.UTC(
        value('year'),
        value('month') - 1,
        value('day'),
        value('hour'),
        value('minute'),
        value('second'),
      ) - instant.getTime()
    );
  };

  const first = new Date(targetAsUtc - offsetAt(new Date(targetAsUtc)));
  return new Date(targetAsUtc - offsetAt(first));
}

export function isFutureBusinessDay(day: string, now = new Date()): boolean {
  return day > businessCalendarDay(now);
}

/** Sottrazione su giorni civili: nessuna ora locale, quindi nessun salto DST. */
export function subtractCalendarDays(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, date!));
  value.setUTCDate(value.getUTCDate() - amount);
  return value.toISOString().slice(0, 10);
}
