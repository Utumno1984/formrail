// Story-only (#518): the in-memory, deterministic "server" of the record-editing showcases, generic over the
// record type. One store per story mount (no module singleton): two stores never share state, so two modules
// (two record types) never share a delay, an outcome or an `error-once`. Not exported by the package.
// A domain showcase uses it through a store of its own, built on top of it.

export type SaveOutcome = 'success' | 'error';
export type DeleteOutcome = 'success' | 'error';
/** `error-once`: the first read fails, the following ones succeed (to exercise "Retry"). */
export type LoadOutcome = 'success' | 'error' | 'error-once';

export interface RecordStoreConfig {
  /** Delay of `get` and `list`. */
  loadDelayMs: number;
  /**
   * A number of ms, or a promise the save waits on instead of a timer: lets a test hold a save in flight
   * and release it at an exact moment, independent of CPU load. A settled promise adds no wait.
   */
  saveDelayMs: number | Promise<void>;
  saveOutcome: SaveOutcome;
  loadOutcome: LoadOutcome;
  /** `error`: `delete` rejects with `RecordNetworkError` and the store is unchanged (#365). */
  deleteOutcome: DeleteOutcome;
}

/** Capitalizes the first letter: `task` -> `Task`. */
const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export class RecordNotFoundError extends Error {
  readonly id: string;
  /** `noun`: the record type in the message, `Record "<id>" not found` by default. */
  constructor(id: string, noun = 'record') {
    super(`${capitalize(noun)} "${id}" not found`);
    this.name = 'RecordNotFoundError';
    this.id = id;
  }
}

export class RecordNetworkError extends Error {
  constructor(message = 'Network error') {
    super(message);
    this.name = 'RecordNetworkError';
  }
}

/**
 * Story-only (#384): a record changed on the "server" by someone else. `record` is the record as the server
 * now holds it, or `null` when it was deleted.
 */
export interface RecordServerChange<T> {
  id: string;
  record: T | null;
}

/** `T`: the record as stored. `D`: what the client sends to create one (everything but what the server assigns). */
export interface RecordStore<T extends { id: string }, D = Omit<T, 'id'>> {
  list: () => Promise<T[]>;
  /** Rejects with `RecordNotFoundError` for an unknown id. */
  get: (id: string) => Promise<T>;
  /**
   * Resolves with the record "as stored by the server" (after the store's `normalize`), or rejects with
   * `RecordNetworkError` when `saveOutcome` is `error` (the store is then unchanged), with `RecordNotFoundError`
   * for an id that does not exist (any more) when the delay ends.
   */
  save: (record: T) => Promise<T>;
  /**
   * Creates a record (#363): the "server" assigns the identity (`createId`, and any other field `fromDraft`
   * sets) from a monotonic counter that never reuses one, whatever happens to the records later. Same delay,
   * outcome (`RecordNetworkError`, store unchanged) and `normalize` as `save`.
   */
  create: (draft: D) => Promise<T>;
  /**
   * Deletes a record (#365) after `saveDelayMs`. Rejects with `RecordNetworkError` when `deleteOutcome` is
   * `error` (the store is then unchanged), with `RecordNotFoundError` for an id that does not exist (any
   * more). The identity of a deleted record is never issued again (see `create`).
   */
  delete: (id: string) => Promise<void>;
  /**
   * Deletes several records in ONE operation (#366), all or nothing: after `saveDelayMs`, an error
   * (`deleteOutcome: 'error'` -> `RecordNetworkError`, or an id that does not exist -> `RecordNotFoundError`
   * for the first missing one) leaves the store unchanged. Repeated ids count once; no ids resolve at once.
   */
  deleteMany: (ids: readonly string[]) => Promise<void>;
  /**
   * Story-only (#384, used by a Pro story with Change Summary): another user changes a record
   * after `delayMs` (a number of ms or a promise, as `saveDelayMs`; default 0). `change` gets a copy of the
   * stored record and returns the new one (after the store's `normalize`, as by `save`); the subscribers are
   * then told (`subscribe`). Rejects with `RecordNotFoundError` for an id that does not exist (any more) when
   * the delay ends.
   *
   * The server received a save before it answers: an update landing while a save of the same record is in
   * flight is applied to the stored record at once, then applied AGAIN on top of what that save writes (the
   * other user's operation is replayed after ours, never overwritten by the copy our save carries). The save
   * still resolves with what it wrote; the subscribers are told the record with the update on top.
   * Never called by the Free showcase.
   */
  updateFromServer: (id: string, change: (record: T) => T, delayMs?: number | Promise<void>) => Promise<T>;
  /** Story-only (#384): another user deletes a record after `delayMs`; the subscribers get `record: null`. */
  removeFromServer: (id: string, delayMs?: number | Promise<void>) => Promise<void>;
  /** Story-only (#384): called after every `updateFromServer`/`removeFromServer` (see there). Returns the unsubscribe. */
  subscribe: (listener: (change: RecordServerChange<T>) => void) => () => void;
  /** Changes delays/outcomes; applies to the calls made from now on. */
  configure: (patch: Partial<RecordStoreConfig>) => void;
  /** Synchronous read of the current state (for tests and debugging). */
  snapshot: () => T[];
}

export interface RecordStoreOptions<T extends { id: string }, D> {
  /**
   * The id the "server" gives the record of a `create`, from a monotonic counter: the first create gets
   * `seed.length + 1`, and a number is never issued twice (a record removed later never frees it).
   */
  createId: (sequence: number) => string;
  /**
   * The record a `create` stores, from the draft, the new id and the same counter (for other fields the server
   * assigns, such as a document number). Default: the draft plus `id`.
   */
  fromDraft?: (draft: D, id: string, sequence: number) => T;
  /** What the server makes of every record it writes (`save`, `create`, `updateFromServer`), e.g. rounding. Default: as is. */
  normalize?: (record: T) => T;
  /**
   * A copy no caller can reach: the store copies every record in and out, so mutating what a call returned
   * (or what it was given) never changes the store. Default: `structuredClone`.
   */
  copy?: (record: T) => T;
  /** The record type in the failure messages (`Could not save the <one>: network error`). Default: `record`/`records`. */
  noun?: { one: string; many: string };
  /** The errors the store rejects with. Default: `RecordNotFoundError` (with `noun.one`) and `RecordNetworkError`. */
  errors?: {
    notFound: (id: string) => RecordNotFoundError;
    network: (message?: string) => RecordNetworkError;
  };
}

const delay = (ms: number | Promise<void>): Promise<void> => {
  if (typeof ms !== 'number') return ms;
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
};

export function createRecordStore<T extends { id: string }, D = Omit<T, 'id'>>(
  seed: readonly T[],
  options: RecordStoreOptions<T, D>,
  initial: Partial<RecordStoreConfig> = {},
): RecordStore<T, D> {
  const {
    createId,
    fromDraft = (draft: D, id: string) => ({ ...(draft as object), id }) as unknown as T,
    normalize = (record: T) => record,
    copy = (record: T) => structuredClone(record),
    noun = { one: 'record', many: 'records' },
  } = options;
  const errors = options.errors ?? {
    notFound: (id: string) => new RecordNotFoundError(id, noun.one),
    network: (message?: string) => new RecordNetworkError(message),
  };
  const config: RecordStoreConfig = {
    loadDelayMs: 0,
    saveDelayMs: 0,
    saveOutcome: 'success',
    loadOutcome: 'success',
    deleteOutcome: 'success',
    ...initial,
  };
  // Copies in and out: a caller mutating what it gave or got can never change the store.
  const records = new Map<string, T>(seed.map((r) => [r.id, copy(r)]));
  const write = (record: T): T => normalize(copy(record));
  let failedOnce = false;
  // Monotonic: the next identity is one past the highest ever issued (a record removed later never frees it).
  let sequence = seed.length;
  // #384 (story-only): the saves in flight per record, each with the server updates that landed meanwhile.
  type Change = (record: T) => T;
  const inFlight = new Map<string, Set<Change[]>>();
  const listeners = new Set<(change: RecordServerChange<T>) => void>();
  const notify = (change: RecordServerChange<T>) => {
    for (const listener of [...listeners]) listener(change);
  };
  const saveFailed = () => errors.network(`Could not save the ${noun.one}: network error`);

  async function read<R>(produce: () => R): Promise<R> {
    // The config is read when the call is made, not when the delay ends.
    const { loadDelayMs, loadOutcome } = config;
    const fail = loadOutcome === 'error' || (loadOutcome === 'error-once' && !failedOnce);
    if (loadOutcome === 'error-once') failedOnce = true;
    await delay(loadDelayMs);
    if (fail) throw errors.network();
    return produce();
  }

  return {
    list: () => read(() => [...records.values()].map(copy)),
    get: (id) =>
      read(() => {
        const found = records.get(id);
        if (!found) throw errors.notFound(id);
        return copy(found);
      }),
    async save(record) {
      const { saveDelayMs, saveOutcome } = config;
      // The server updates of this record that land while this save is in flight (#384; none in the Free showcase).
      const landed: Change[] = [];
      const flights = inFlight.get(record.id) ?? new Set<Change[]>();
      inFlight.set(record.id, flights.add(landed));
      try {
        await delay(saveDelayMs);
      } finally {
        flights.delete(landed);
        if (flights.size === 0) inFlight.delete(record.id);
      }
      if (saveOutcome === 'error') throw saveFailed();
      if (!records.has(record.id)) throw errors.notFound(record.id);
      const stored = write(record);
      if (landed.length === 0) {
        records.set(stored.id, stored);
        return copy(stored);
      }
      // Replayed on top of this save, which the server received first: the response is what this save wrote.
      const merged = landed.reduce((current, change) => write(change(copy(current))), stored);
      records.set(stored.id, merged);
      notify({ id: stored.id, record: copy(merged) });
      return copy(stored);
    },
    async create(draft) {
      const { saveDelayMs, saveOutcome } = config;
      await delay(saveDelayMs);
      if (saveOutcome === 'error') throw saveFailed();
      sequence += 1;
      const stored = write(fromDraft(draft, createId(sequence), sequence));
      records.set(stored.id, stored);
      return copy(stored);
    },
    async delete(id) {
      const { saveDelayMs, deleteOutcome } = config;
      await delay(saveDelayMs);
      if (deleteOutcome === 'error') throw errors.network(`Could not delete the ${noun.one}: network error`);
      if (!records.delete(id)) throw errors.notFound(id);
    },
    async deleteMany(ids) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return;
      const { saveDelayMs, deleteOutcome } = config;
      await delay(saveDelayMs);
      if (deleteOutcome === 'error') throw errors.network(`Could not delete the ${noun.many}: network error`);
      // Checked as a whole BEFORE removing anything: all or nothing.
      const missing = unique.find((id) => !records.has(id));
      if (missing !== undefined) throw errors.notFound(missing);
      for (const id of unique) records.delete(id);
    },
    async updateFromServer(id, change, delayMs = 0) {
      await delay(delayMs);
      const current = records.get(id);
      if (!current) throw errors.notFound(id);
      const updated = write(change(copy(current)));
      records.set(id, updated);
      for (const landed of inFlight.get(id) ?? []) landed.push(change);
      notify({ id, record: copy(updated) });
      return copy(updated);
    },
    async removeFromServer(id, delayMs = 0) {
      await delay(delayMs);
      if (!records.delete(id)) throw errors.notFound(id);
      notify({ id, record: null });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    configure: (patch) => {
      Object.assign(config, patch);
    },
    snapshot: () => [...records.values()].map(copy),
  };
}
