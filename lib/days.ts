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
