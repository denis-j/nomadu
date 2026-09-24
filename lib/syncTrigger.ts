/**
 * "Something changed locally": the one signal the database layer sends
 * upward. `SyncContext` listens and pushes a little later, so an edit made
 * on this phone reaches the cloud (and a friend following the trip, or the
 * agent) within seconds instead of at the next app start.
 *
 * A plain callback rather than an event emitter: there is exactly one
 * listener, and `database.ts` must not import `sync.ts` (which imports it).
 */

let listener: (() => void) | null = null;

export function onLocalChange(fn: () => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function localChanged(): void {
  listener?.();
}

/**
 * "A trip or a visa changed here": tracking, a manual entry, an edit, a
 * delete. Separate from `localChanged` because trips and visas go out with
 * the full sync, not the plans push, and used to wait for the next cold
 * start, which iOS can put off for days. One listener, like `localChanged`.
 */
let timelineListener: (() => void) | null = null;

export function onTimelineChange(fn: () => void): () => void {
  timelineListener = fn;
  return () => {
    if (timelineListener === fn) timelineListener = null;
  };
}

export function timelineChanged(): void {
  timelineListener?.();
}

/**
 * "The cloud changed what is on this phone": a sync finished, the realtime
 * listener applied a document, or another account's data was wiped. Screens
 * used to re-read only when they came into focus, so a timeline that was
 * already open stayed empty after a sync filled the database. Many
 * listeners (every data hook), and coalesced, because one sync or one
 * snapshot writes hundreds of rows.
 */
const cloudListeners = new Set<() => void>();
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
const CLOUD_NOTIFY_DELAY_MS = 300;

export function onCloudChange(fn: () => void): () => void {
  cloudListeners.add(fn);
  return () => {
    cloudListeners.delete(fn);
  };
}

export function cloudChanged(): void {
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    cloudTimer = null;
    cloudListeners.forEach((fn) => fn());
  }, CLOUD_NOTIFY_DELAY_MS);
}
