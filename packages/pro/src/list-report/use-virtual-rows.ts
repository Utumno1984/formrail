import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import {
  computeRange,
  layoutSegments,
  sameRange,
  scrollTopForIndex,
  type ScrollAlign,
  type VirtualRange,
  type VirtualSegment,
} from '../internal/virtual-rows';
import { useIsomorphicLayoutEffect } from '../internal/use-isomorphic-layout-effect';

/**
 * Row pitch before the first measurement: the core's default `--rop-list-report-row-height`
 * (2.75rem at a 16px root) + `ROW_PITCH_EXTRA_PX` (3). Also the server value: the first client
 * render must produce the same range as the server, so nothing measured is used before mount.
 */
// A literal on purpose: an arithmetic expression at module level is not dropped by tree-shaking.
export const FALLBACK_PITCH = 47; // 2.75rem x 16px + 3px

/**
 * Height of the visible area of the rows before the first measurement (server render and first
 * client render): `ceil(800 / 47) + overscan` rows are rendered, enough for a typical viewport, with
 * the bottom spacer already giving the scrollbar its real proportion.
 */
export const DEFAULT_VIEWPORT = 800;

interface Metrics {
  /** `scrollTop` of the scroller. */
  scrollTop: number;
  /** `clientHeight` of the scroller. */
  clientHeight: number;
  /** Height covered at the top of the viewport by the sticky header (`<thead>`). */
  stickyHeight: number;
  /** Offset of the first row from the top of the scroll content. */
  bodyStart: number;
  /** Height of one data row (fractional, from `getBoundingClientRect`). */
  pitch: number;
  /** `false` until a real row has been measured: spacers are then sized in CSS (see `spacerHeight`). */
  measured: boolean;
}

const INITIAL: Metrics = {
  scrollTop: 0,
  clientHeight: DEFAULT_VIEWPORT,
  stickyHeight: 0,
  bodyStart: 0,
  pitch: FALLBACK_PITCH,
  measured: false,
};

function rangeOf(m: Metrics, overscan: number, count: number): VirtualRange {
  return computeRange(m.scrollTop + m.stickyHeight - m.bodyStart, m.clientHeight - m.stickyHeight, m.pitch, overscan, count);
}

const sameMetrics = (a: Metrics, b: Metrics): boolean => (Object.keys(a) as (keyof Metrics)[]).every((key) => a[key] === b[key]);

/**
 * Reads the layout. Anything without a layout (jsdom, `display: none`) reads 0: the previous value is
 * kept instead, so a viewport or a pitch of 0 never mounts every row.
 */
function measure(el: HTMLElement, previous: Metrics): Metrics {
  const thead = el.querySelector('thead');
  const tbody = el.querySelector('tbody');
  const box = el.getBoundingClientRect();
  const stickyHeight = thead ? thead.getBoundingClientRect().height : 0;
  const bodyStart = tbody ? tbody.getBoundingClientRect().top - box.top - el.clientTop + el.scrollTop : stickyHeight;
  // Spacers have no `aria-rowindex`.
  const row = el.querySelector('tbody > tr[aria-rowindex]');
  const rowHeight = row ? row.getBoundingClientRect().height : 0;
  const clientHeight = el.clientHeight;
  return {
    scrollTop: el.scrollTop,
    clientHeight: clientHeight > 0 ? clientHeight : previous.clientHeight,
    stickyHeight: clientHeight > 0 ? stickyHeight : previous.stickyHeight,
    bodyStart: clientHeight > 0 ? bodyStart : previous.bodyStart,
    pitch: rowHeight > 0 ? rowHeight : previous.pitch,
    measured: rowHeight > 0 || previous.measured,
  };
}

export interface UseVirtualRowsOptions {
  /**
   * `false`: nothing is mounted — no scroll listener, no ResizeObserver, no range computed, no state
   * update (the table renders every row, as the Free one).
   */
  enabled: boolean;
  /** Number of rows (the current results). */
  count: number;
  /** Extra rows above and below the visible area. */
  overscan: number;
  /** Index of the row holding the focus: kept mounted outside the range. */
  pinnedIndex: number | null;
  /** The element that scrolls (the table's container). */
  scrollerRef: RefObject<HTMLElement | null>;
}

export interface UseVirtualRowsReturn {
  /** The body, in document order: spacers and runs of rows (`[]` when disabled). */
  segments: VirtualSegment[];
  /**
   * CSS height of a spacer of `rows` rows. Before the first measurement it is computed by the browser
   * from `--rop-list-report-row-height` (so the scroll height is already exact in the very first commit
   * with data, when the core's scroll restoration assigns `scrollTop`); afterwards it is `rows x` the
   * measured pitch, in px (the same pitch the range is computed with).
   */
  spacerHeight: (rows: number) => string;
  /** Scrolls so that row `index` is visible (see `scrollTopForIndex`). `false` without a scroller. */
  scrollToIndex: (index: number, align: ScrollAlign) => boolean;
}

/**
 * The virtualizer of `VirtualListReportTable`: scroll/ResizeObserver plumbing over the pure
 * `computeRange`/`layoutSegments` (`../internal/virtual-rows`).
 *
 * - Range O(1) from `scrollTop / pitch`, the header height subtracted.
 * - The pitch is measured from a mounted data row (fractional px), re-measured by a ResizeObserver on
 *   the body (a change of `--rop-list-report-row-height` from `className`/`style`, zoom, font size), on
 *   the header and on the scroller (viewport).
 * - A scroll that changes the range re-renders synchronously (`flushSync`) inside the `scroll` event,
 *   which the browser dispatches before painting: no blank frame at normal speed.
 * - After every commit the real `scrollTop` is re-read in a layout effect: a programmatic scroll done
 *   in the same commit (e.g. `useListReportScrollRestoration`) is picked up before paint.
 */
export function useVirtualRows({ enabled, count, overscan, pinnedIndex, scrollerRef }: UseVirtualRowsOptions): UseVirtualRowsReturn {
  const [metrics, setMetrics] = useState<Metrics>(INITIAL);
  const range = enabled ? rangeOf(metrics, overscan, count) : null;

  const latest = useRef({ metrics, overscan, count, range });
  latest.current = { metrics, overscan, count, range };

  const update = useCallback((next: Metrics) => {
    setMetrics((current) => (sameMetrics(current, next) ? current : next));
  }, []);

  // The metrics a scroll event has just read: their commit does not read `scrollTop` again, because the
  // getter forces a synchronous layout of the rows that commit has just changed.
  const scrollRead = useRef<Metrics | null>(null);

  // Listeners and observers: only while enabled.
  useIsomorphicLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!enabled || !el) return undefined;
    update(measure(el, latest.current.metrics));

    const onScroll = () => {
      const { metrics: m, overscan: o, count: c, range: rendered } = latest.current;
      const next = { ...m, scrollTop: el.scrollTop };
      if (rendered && sameRange(rangeOf(next, o, c), rendered)) return;
      scrollRead.current = next;
      flushSync(() => update(next));
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      // Geometry only: a `scrollTop` taken here would commit the new range at default priority, after
      // paint, and the scroll event that follows would find nothing to flush.
      ro = new ResizeObserver(() => {
        const { metrics: m } = latest.current;
        update({ ...measure(el, m), scrollTop: m.scrollTop });
      });
      ro.observe(el);
      // The body, not a row: it stays mounted and its height changes with the pitch, not with the range,
      // so a scroll never triggers the observer.
      el.querySelectorAll('thead, tbody').forEach((part) => ro?.observe(part));
    }
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [enabled, scrollerRef, update]);

  // After every commit while enabled: pick up a `scrollTop` changed outside a scroll event.
  useIsomorphicLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!enabled || !el) return;
    const { metrics: m } = latest.current;
    const justRead = m === scrollRead.current;
    scrollRead.current = null;
    if (!m.measured) {
      update(measure(el, m));
    } else if (!justRead && el.scrollTop !== m.scrollTop) {
      update({ ...m, scrollTop: el.scrollTop });
    }
  });

  const segments = useMemo(
    () => (range ? layoutSegments(range, count, pinnedIndex) : []),
    // `range` is a fresh object each render: depend on its numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range?.start, range?.end, count, pinnedIndex],
  );

  const { measured, pitch } = metrics;
  const spacerHeight = useCallback(
    (rows: number) => (measured ? `${rows * pitch}px` : `calc((var(--rop-list-report-row-height) + 3px) * ${rows})`),
    [measured, pitch],
  );

  const scrollToIndex = useCallback(
    (index: number, align: ScrollAlign): boolean => {
      const el = scrollerRef.current;
      if (!el) return false;
      const m = measure(el, latest.current.metrics);
      const next = scrollTopForIndex({
        index,
        pitch: m.pitch,
        bodyStart: m.bodyStart,
        stickyHeight: m.stickyHeight,
        clientHeight: m.clientHeight,
        scrollTop: el.scrollTop,
        align,
      });
      if (next !== null) el.scrollTop = next;
      // The browser clamps the assignment: read it back. The range follows now, not at the next scroll event.
      update({ ...m, scrollTop: el.scrollTop });
      return true;
    },
    [scrollerRef, update],
  );

  return { segments, spacerHeight, scrollToIndex };
}
