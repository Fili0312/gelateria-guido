const BUSINESS_TIME_ZONE = 'Europe/Rome';

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
