import type { ListReportUrlAdapter } from '../list-report/use-list-report-url-state';

export interface MemoryUrlAdapter extends ListReportUrlAdapter {
  /** The history entries (query strings), oldest first. */
  readonly entries: readonly string[];
  /** Index of the current entry. */
  readonly index: number;
  /** Moves in the simulated history (like a router's `navigate(-1)`), then notifies. */
  go(delta: number): void;
  /** Replaces the current entry from outside the hook (a navigation of the app), then notifies. */
  set(search: string): void;
  listenerCount(): number;
}

export interface MemoryUrlAdapterOptions {
  initial?: string;
  /** How subscribers hear about a change: right away (default), in a microtask, or not at all by `write`. */
  notify?: 'sync' | 'microtask';
  /** Called after every `write` of the hook. */
  onWrite?: (search: string, mode: 'replace' | 'push') => void;
  /** Re-encodes what `write` stores, like a router that normalizes the query. */
  normalize?: (search: string) => string;
}

/** A router-like query string in memory with a simulated history. Fixture of tests and of the recipe story. */
export function createMemoryUrlAdapter(options: MemoryUrlAdapterOptions = {}): MemoryUrlAdapter {
  const { initial = '', notify = 'sync', onWrite, normalize = (s) => s } = options;
  const entries: string[] = [initial];
  let index = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  const emitLater = () => {
    if (notify === 'sync') emit();
    else queueMicrotask(emit);
  };
  return {
    get entries() {
      return entries;
    },
    get index() {
      return index;
    },
    read: () => new URLSearchParams(entries[index]),
    write: (next, mode) => {
      const search = normalize(next.toString());
      onWrite?.(search, mode);
      if (mode === 'push') {
        entries.splice(index + 1, entries.length, search);
        index += 1;
      } else {
        entries[index] = search;
      }
      emitLater();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    go: (delta) => {
      index = Math.max(0, Math.min(entries.length - 1, index + delta));
      emit();
    },
    set: (search) => {
      entries[index] = search;
      emit();
    },
    listenerCount: () => listeners.size,
  };
}
