import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { listReportParamKeys, type ListReportParamNames } from './param-keys';

export interface UseListReportScrollRestorationOptions {
  /**
   * Identifies the view. Default: the pathname plus this report's own parameters (pill, search and
   * sort, same names and `prefix` as `useListReportUrlState`) read from the URL **when the scroll is
   * saved or restored**: two different pills have each their own position.
   */
  key?: string;
  /** Same as in `useListReportUrlState`: namespace of the parameters, for two reports in a page. */
  prefix?: string;
  /** Same as in `useListReportUrlState`: names of the parameters. */
  params?: ListReportParamNames;
  /**
   * `true` once the data is on screen (e.g. `!loading && !error`). The position is restored in the
   * first commit where this is `true`, and never before: the loading skeleton is not scrolled.
   */
  ready: boolean;
  /** Where the position lives. Default `window.sessionStorage` (when missing or throwing: nothing is saved or restored). */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export interface UseListReportScrollRestorationReturn {
  /** Give it to `ListReport` as `scrollerRef` (or to the `ref` of `ListReportTable`). */
  ref: (element: HTMLElement | null) => void;
}

const STORAGE_PREFIX = 'rop:list-report-scroll:';
/** Writes are at most one per this many ms while the user scrolls; the last value is also written on unmount and `pagehide`. */
const SAVE_INTERVAL_MS = 150;

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface Position {
  top: number;
  left: number;
}

function parsePosition(raw: string | null): Position | undefined {
  if (raw === null) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return undefined;
    const { top, left } = value as Record<string, unknown>;
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    return ok(top) && ok(left) ? { top, left } : undefined;
  } catch {
    return undefined;
  }
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined; // access denied (some privacy modes throw on the property itself)
  }
}

/**
 * Saves the scroll of the table's container in `sessionStorage` and puts it back when the report is
 * mounted again with its data (the user went to a detail page and came back).
 *
 * ```tsx
 * const scroll = useListReportScrollRestoration({ ready: !loading && !error });
 * <ListReport scrollerRef={scroll.ref} ... />
 * ```
 *
 * - The container (not the window) is scrolled; `window.scrollY` is never touched, and neither is
 *   `history.scrollRestoration`. Both `scrollTop` and `scrollLeft` are saved.
 * - Restored once per mount, in the first commit with `ready === true` (layout effect, no flash at the
 *   top), and never after the user scrolled the container before that: a gesture wins.
 * - A position longer than the data stops at the maximum the browser allows. `ready` with an empty list or
 *   an error: consumers pass `ready: false` for those; nothing is restored and the stored value is kept
 *   until the user scrolls.
 * - Writes are throttled (150 ms) and the last value is flushed on unmount and `pagehide`.
 * - Storage missing, throwing (quota, private mode) or holding a corrupt value: no error, no restore.
 * - Server rendering touches nothing (all browser access is lazy).
 * - Two reports in a page: give them different `prefix` (or `key`).
 * - The default key reads `window.location`; with a router `adapter` in `useListReportUrlState` (a URL that is
 *   not the browser's) pass your own `key`.
 * - Hand `scroll.ref` to `scrollerRef` as it is (a new inline wrapper at every render detaches and re-attaches it).
 * - Changing pill does not reset the container's scroll by itself; a position is saved per URL, so coming
 *   back to a view you did not scroll starts at the top.
 */
export function useListReportScrollRestoration(
  options: UseListReportScrollRestorationOptions,
): UseListReportScrollRestorationReturn {
  const { key, prefix, params, ready, storage } = options;
  const latest = useRef({ key, prefix, params, ready, storage });
  latest.current = { key, prefix, params, ready, storage };

  const elementRef = useRef<HTMLElement | null>(null);
  const restored = useRef(false);
  const touched = useRef(false);
  const echo = useRef<Position | null>(null);
  const pending = useRef<{ storageKey: string; position: Position } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const resolveKey = useCallback((): string => {
    const { key: explicit, prefix: p, params: names } = latest.current;
    if (explicit !== undefined) return STORAGE_PREFIX + explicit;
    if (typeof window === 'undefined') return STORAGE_PREFIX;
    const query = new URLSearchParams(window.location.search);
    const own = new URLSearchParams();
    for (const name of listReportParamKeys(p, names)) for (const value of query.getAll(name)) own.append(name, value);
    own.sort();
    // The prefix is part of the key: two reports in their default state have no parameter in the URL.
    return `${STORAGE_PREFIX}${p ?? ''}#${window.location.pathname}?${own.toString()}`;
  }, []);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const entry = pending.current;
    pending.current = null;
    if (!entry) return;
    try {
      (latest.current.storage ?? defaultStorage())?.setItem(entry.storageKey, JSON.stringify(entry.position));
    } catch {
      /* quota, private mode: nothing to do */
    }
  }, []);

  const tryRestore = useCallback(() => {
    const element = elementRef.current;
    if (!element || !latest.current.ready || restored.current) return;
    restored.current = true; // at most once, whatever happens next
    if (touched.current) return;
    let saved: Position | undefined;
    try {
      saved = parsePosition((latest.current.storage ?? defaultStorage())?.getItem(resolveKey()) ?? null);
    } catch {
      return;
    }
    if (!saved) return;
    const before = { top: element.scrollTop, left: element.scrollLeft };
    element.scrollTop = saved.top;
    element.scrollLeft = saved.left;
    const after = { top: element.scrollTop, left: element.scrollLeft };
    // The browser reports our own assignment with a `scroll` event: it is not a gesture and must not be
    // saved (a position cut short by a momentarily shorter dataset would otherwise overwrite the good one).
    echo.current = after.top !== before.top || after.left !== before.left ? after : null;
  }, [resolveKey]);

  const onScroll = useCallback(
    (event: Event) => {
      const element = event.currentTarget as HTMLElement;
      const expected = echo.current;
      echo.current = null;
      if (expected && expected.top === element.scrollTop && expected.left === element.scrollLeft) return;
      // A scroll before the restoration is the user's: it cancels the restoration.
      if (!restored.current) touched.current = true;
      const storageKey = resolveKey();
      // The URL moved inside the throttle window: the last position of the previous view is written first.
      if (pending.current && pending.current.storageKey !== storageKey) flush();
      pending.current = { storageKey, position: { top: element.scrollTop, left: element.scrollLeft } };
      if (timer.current === undefined) timer.current = setTimeout(flush, SAVE_INTERVAL_MS);
    },
    [flush, resolveKey],
  );

  const ref = useCallback(
    (element: HTMLElement | null) => {
      const previous = elementRef.current;
      if (previous === element) return;
      if (previous) {
        previous.removeEventListener('scroll', onScroll);
        // The value is the one of the last scroll event: the detached element no longer knows its own.
        flush();
      }
      elementRef.current = element;
      if (element) {
        element.addEventListener('scroll', onScroll, { passive: true });
        tryRestore();
      }
    },
    [flush, onScroll, tryRestore],
  );

  useIsomorphicLayoutEffect(() => {
    tryRestore();
  }, [ready, tryRestore]);

  useEffect(() => {
    const onPageHide = () => flush();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      flush();
    };
  }, [flush]);

  return useMemo(() => ({ ref }), [ref]);
}
