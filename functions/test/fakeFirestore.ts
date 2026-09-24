/**
 * An in-memory stand-in for the slice of `firebase-admin/firestore` the
 * agent API uses: collections, documents, get/set/update/delete, `where`
 * with `==` and `array-contains`, `Timestamp` and `FieldValue.serverTimestamp()`.
 *
 * Substituted for the real module when the tests are bundled
 * (scripts/test.mjs), so the routes run unchanged against a map. Deliberately
 * small: `set` without merge replaces, `update` and `set({merge})` are
 * shallow, and there are no transactions, because the routes need none of
 * the rest. Anything else throws so a test cannot pass by accident.
 */

type Data = Record<string, unknown>;

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static now(): Timestamp {
    return Timestamp.fromDate(new Date());
  }
  static fromDate(d: Date): Timestamp {
    const ms = d.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1_000_000);
  }
  toDate(): Date {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1_000_000));
  }
  toMillis(): number {
    return this.toDate().getTime();
  }
}

const INCREMENT = Symbol('increment');

export const FieldValue = {
  serverTimestamp: () => Timestamp.now(),
  increment: (n: number) => ({ [INCREMENT]: n }),
};

/** Resolve FieldValue.increment against what is stored. */
function applyIncrements(prev: Data, next: Data): Data {
  const out: Data = { ...next };
  for (const [k, v] of Object.entries(next)) {
    if (v && typeof v === 'object' && INCREMENT in (v as object)) {
      const base = typeof prev[k] === 'number' ? (prev[k] as number) : 0;
      out[k] = base + (v as Record<symbol, number>)[INCREMENT];
    }
  }
  return out;
}

/** Deep copy that keeps Timestamps as Timestamps. */
function clone<T>(value: T): T {
  if (value instanceof Timestamp) return value as T;
  if (value && typeof value === 'object' && INCREMENT in (value as object)) return value;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    const out: Data = {};
    for (const [k, v] of Object.entries(value as Data)) out[k] = clone(v);
    return out as T;
  }
  return value;
}

const store = new Map<string, Data>();

/** Wipe everything between tests. */
export function __reset(): void {
  store.clear();
}

/** Seed a document directly. */
export function __seed(path: string, data: Data): void {
  store.set(path, clone(data));
}

/** Read a document directly, for assertions on what was written. */
export function __get(path: string): Data | undefined {
  const x = store.get(path);
  return x ? clone(x) : undefined;
}

class DocumentSnapshot {
  constructor(public ref: DocumentReference, private readonly value: Data | undefined) {}
  get id(): string {
    return this.ref.id;
  }
  get exists(): boolean {
    return this.value !== undefined;
  }
  data(): Data | undefined {
    return this.value ? clone(this.value) : undefined;
  }
  get(field: string): unknown {
    return this.value ? clone(this.value[field]) : undefined;
  }
}

class DocumentReference {
  constructor(public path: string) {}
  get id(): string {
    return this.path.split('/').pop()!;
  }
  async get(): Promise<DocumentSnapshot> {
    return new DocumentSnapshot(this, store.get(this.path));
  }
  async set(data: Data, options?: { merge?: boolean }): Promise<void> {
    const prev = options?.merge ? store.get(this.path) ?? {} : {};
    store.set(this.path, { ...prev, ...applyIncrements(store.get(this.path) ?? {}, clone(data)) });
  }
  async update(data: Data): Promise<void> {
    const prev = store.get(this.path);
    if (!prev) throw new Error(`update on missing document ${this.path}`);
    for (const key of Object.keys(data)) {
      if (key.includes('.')) throw new Error('the fake does not support dotted field paths');
    }
    store.set(this.path, { ...prev, ...clone(data) });
  }
  async delete(): Promise<void> {
    store.delete(this.path);
  }
}

class Query {
  constructor(protected readonly path: string, private readonly filters: { field: string; op: string; value: unknown }[] = []) {}
  where(field: string, op: string, value: unknown): Query {
    if (op !== '==' && op !== 'array-contains') throw new Error(`the fake only supports == and array-contains, not ${op}`);
    return new Query(this.path, [...this.filters, { field, op, value }]);
  }
  async get(): Promise<{ docs: DocumentSnapshot[]; size: number; empty: boolean }> {
    const prefix = `${this.path}/`;
    const docs: DocumentSnapshot[] = [];
    for (const [path, data] of store) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
      const miss = this.filters.some((f) =>
        f.op === 'array-contains' ? !(Array.isArray(data[f.field]) && (data[f.field] as unknown[]).includes(f.value)) : data[f.field] !== f.value,
      );
      if (miss) continue;
      docs.push(new DocumentSnapshot(new DocumentReference(path), data));
    }
    docs.sort((a, b) => a.id.localeCompare(b.id));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class CollectionReference extends Query {
  doc(id?: string): DocumentReference {
    return new DocumentReference(`${this.path}/${id ?? `auto_${store.size}_${Math.random().toString(36).slice(2, 8)}`}`);
  }
}

class Firestore {
  collection(path: string): CollectionReference {
    return new CollectionReference(path.replace(/^\/+|\/+$/g, ''));
  }
  doc(path: string): DocumentReference {
    return new DocumentReference(path.replace(/^\/+|\/+$/g, ''));
  }
  /**
   * Transactions run their function once against the map: the fake is
   * single-threaded, so there is nothing to retry against.
   */
  async runTransaction<T>(fn: (tx: {
    get: (target: DocumentReference | Query) => Promise<unknown>;
    set: (ref: DocumentReference, data: Data, options?: { merge?: boolean }) => void;
    update: (ref: DocumentReference, data: Data) => void;
  }) => Promise<T>): Promise<T> {
    const writes: (() => Promise<void>)[] = [];
    const result = await fn({
      get: (target) => target.get(),
      set: (ref, data, options) => { writes.push(() => ref.set(data, options)); },
      update: (ref, data) => { writes.push(() => ref.update(data)); },
    });
    for (const w of writes) await w();
    return result;
  }
  /** The document and everything under it, like the Admin SDK's. */
  async recursiveDelete(ref: DocumentReference): Promise<void> {
    for (const key of [...store.keys()]) {
      if (key === ref.path || key.startsWith(`${ref.path}/`)) store.delete(key);
    }
  }
}

const instance = new Firestore();

export function getFirestore(): Firestore {
  return instance;
}
