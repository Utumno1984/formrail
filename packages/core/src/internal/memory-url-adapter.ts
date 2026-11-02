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
  /** How subscribers hear about a change made by `write`: right away (default) or in a microtask. */
  notify?: 'sync' | 'microtask';
  /**
   * A router that applies a `write` only at its next render: with `true`, `read()` returns the old query
   * until the (microtask) notification, as `useSearchParams` does. Implies `notify: 'microtask'`.
   */
  lag?: boolean;
  /** Called after every `write` of the hook. */
  onWrite?: (search: string, mode: 'replace' | 'push') => void;
  /** Re-encodes what `write` stores, like a router that normalizes the query. */
  normalize?: (search: string) => string;
}

/** A router-like query string in memory with a simulated history. Fixture of tests and of the recipe story. */
export function createMemoryUrlAdapter(options: MemoryUrlAdapterOptions = {}): MemoryUrlAdapter {
  const { initial = '', lag = false, onWrite, normalize = (s) => s } = options;
  const notify = lag ? 'microtask' : (options.notify ?? 'sync');
  const entries: string[] = [initial];
  let index = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  const apply = (search: string, mode: 'replace' | 'push') => {
    if (mode === 'push') {
      entries.splice(index + 1, entries.length, search);
      index += 1;
    } else {
      entries[index] = search;
    }
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
      if (lag) {
        queueMicrotask(() => {
          apply(search, mode);
          emit();
        });
        return;
      }
      apply(search, mode);
      if (notify === 'sync') emit();
      else queueMicrotask(emit);
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
