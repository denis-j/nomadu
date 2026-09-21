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
