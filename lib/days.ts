import { activeLanguage, appLocale } from './i18n/locale';
/**
 * Calendar-day arithmetic that survives daylight saving.
 *
 * Every day counter in the app used to walk dates from local midnight and step
 * forward in 24-hour jumps. Both halves of that are unsafe. Chile puts its
 * clocks forward at 24:00, so on that date local midnight does not exist and
 * `new Date(y, m, d)` lands at 01:00; a cursor starting there sits an hour past
 * the end date and drops the last day of the range. And across a spring-forward
 * a calendar day is 23 hours, so counting by elapsed milliseconds comes out one
 * short too. Both errors under-report, which for a visa or tax counter is the
 * direction that tells someone they still have a day left.
 *
 * Noon is the fix: no transition is twelve hours wide, so a noon anchor lands
 * on the intended date in every zone, on every day.
 */

/** Local YYYY-MM-DD. Never via toISOString, which shifts to UTC. */
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The given date at local noon, safe to step and compare. */
export function atNoon(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

/** Visit every calendar day from `from` to `to`, inclusive. */
export function eachDay(from: Date, to: Date, visit: (ymd: string) => void): void {
  const cursor = atNoon(from);
  const last = atNoon(to);
  while (cursor <= last) {
    visit(toYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
}

/** Days from `from` to `to`, inclusive. 0 when the range is empty. */
export function countDays(from: Date, to: Date): number {
  const a = atNoon(from).getTime();
  const b = atNoon(to).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Parse YYYY-MM-DD as a local date at noon. */
export function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * An itinerary is a chain: each stop starts the day after the previous one
 * ends, and a stop's length is what it owns. Reordering, inserting or
 * deleting a stop therefore re-flows every date after it, and the first
 * stop's start is the trip's start. `anchor` overrides that start.
 */
export function chainDates<T extends { start_date: string; end_date: string }>(
  legs: T[],
  anchor?: string,
): { start_date: string; end_date: string }[] {
  let cursor = anchor ?? legs[0]?.start_date;
  return legs.map((l) => {
    const days = Math.max(1, countDays(fromYmd(l.start_date), fromYmd(l.end_date)));
    const start = cursor;
    const endDate = fromYmd(start);
    endDate.setDate(endDate.getDate() + days - 1);
    const next = new Date(endDate);
    next.setDate(next.getDate() + 1);
    cursor = toYmd(next);
    return { start_date: start, end_date: toYmd(endDate) };
  });
}

// ─── Dates as the app writes them ────────────────────────────────────────
// In the app's language (lib/i18n/locale.ts), not the phone's: English is the
// base ("Sep 5, 2026"), German only swaps the order ("5. Sept. 2026"). Every
// screen formats through these, so a date never comes out in two styles.

const asDate = (d: Date | string) => (typeof d === 'string' ? fromYmd(d) : d);

/** "Sep 5" / "5. Sept.": a day where the year is clear from the context. */
export function formatMonthDay(d: Date | string): string {
  return asDate(d).toLocaleDateString(appLocale(), { month: 'short', day: 'numeric' });
}

/**
 * "Sep 5, 2026" / "5. Sept. 2026": a day wherever the year matters. The
 * phone's language used to leak in ("23. Sept. 2026") next to raw
 * "2026-07-03"; now it is the app's language everywhere.
 */
export function formatDay(ymd: string | null | undefined): string {
  if (!ymd) return '';
  return fromYmd(ymd).toLocaleDateString(appLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Sep 5" this year, "Sep 5, 2025" another year. */
export function formatDaySmart(d: Date | string): string {
  const date = asDate(d);
  return date.getFullYear() === new Date().getFullYear() ? formatMonthDay(date) : formatDay(toYmd(date));
}

/**
 * A stretch of days: "Sep 12 – 18" / "12.–18. Sept." inside one month,
 * "Sep 28 – Oct 3" / "28. Sept. – 3. Okt." across two.
 */
export function formatDayRange(start: Date | string, end: Date | string): string {
  const s = asDate(start);
  const e = asDate(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    if (activeLanguage() === 'de') {
      return `${s.getDate()}.–${e.getDate()}. ${s.toLocaleDateString(appLocale(), { month: 'short' })}`;
    }
    return `${formatMonthDay(s)} – ${e.getDate()}`;
  }
  return `${formatMonthDay(s)} – ${formatMonthDay(e)}`;
}

/** "Saturday, November 7, 2026" / "Samstag, 7. November 2026". */
export function formatLongDay(d: Date | string): string {
  return asDate(d).toLocaleDateString(appLocale(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "Sat, Nov 7, 2026" / "Sa., 7. Nov. 2026". */
export function formatWeekdayDay(d: Date | string): string {
  return asDate(d).toLocaleDateString(appLocale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** "November 2026": the heading over a month. */
export function formatMonthYear(d: Date | string): string {
  return asDate(d).toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' });
}

/** "Sep 24, 2026, 2:05 PM" / "24. Sept. 2026, 14:05": a moment, for stamps like the last sync. */
export function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString(appLocale(), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
